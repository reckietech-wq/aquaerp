#!/usr/bin/env bash
# =============================================================================
#  AquaERP — Hostinger KVM 2 (Ubuntu 22.04) Deployment Script
#  Run as root (or with sudo) on a fresh server:
#    chmod +x deploy.sh && sudo ./deploy.sh
# =============================================================================
set -euo pipefail

# ── Configurable ──────────────────────────────────────────────────────────────
APP_DIR="/var/www/water-erp"
DB_NAME="water_erp"
DB_USER="water_erp_user"
DB_PASS="$(openssl rand -base64 24)"   # auto-generated; printed at end
NODE_VERSION="20"
REPO_URL=""   # set this if deploying via git clone, e.g. git@github.com:you/water-erp.git

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
section() { echo -e "\n${GREEN}━━━ $* ━━━${NC}"; }

# ── 1. System update ──────────────────────────────────────────────────────────
section "Updating system packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git build-essential openssl ufw

# ── 2. Node.js 20 via nvm ─────────────────────────────────────────────────────
section "Installing Node.js ${NODE_VERSION} via nvm"
export NVM_DIR="/root/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use default

NODE_BIN="$(nvm which default | xargs dirname)"
export PATH="$NODE_BIN:$PATH"
info "Node $(node -v) — npm $(npm -v)"

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
section "Installing PM2"
npm install -g pm2

# ── 4. PostgreSQL 16 ─────────────────────────────────────────────────────────
section "Installing PostgreSQL 16"
if ! command -v psql &>/dev/null; then
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-16
fi
systemctl enable postgresql
systemctl start postgresql

# ── 5. Create DB and user ─────────────────────────────────────────────────────
section "Creating PostgreSQL database and user"
# Idempotent: only create if they don't exist
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" \
  | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\""

su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" \
  | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\""

su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\""
info "Database '${DB_NAME}' ready"

# ── 6. Nginx ──────────────────────────────────────────────────────────────────
section "Installing Nginx"
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ── 7. Deploy application files ───────────────────────────────────────────────
section "Deploying application to ${APP_DIR}"
if [ -n "$REPO_URL" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    info "Pulling latest changes"
    git -C "$APP_DIR" pull
  else
    git clone "$REPO_URL" "$APP_DIR"
  fi
else
  # When running script from within the project directory, rsync it
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
    info "Copying project from ${SCRIPT_DIR} to ${APP_DIR}"
    rsync -a --exclude=node_modules --exclude='.git' --exclude='*/dist' \
      "$SCRIPT_DIR/" "$APP_DIR/"
  else
    info "Already running from ${APP_DIR}, skipping copy"
  fi
fi

cd "$APP_DIR"

# ── 8. Write production .env ──────────────────────────────────────────────────
section "Writing backend .env"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

# Only write if .env doesn't already exist (avoid overwriting manual edits)
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cat > "$APP_DIR/backend/.env" <<ENVEOF
DATABASE_URL="${DATABASE_URL}"
JWT_SECRET="$(openssl rand -base64 48)"
PORT=5000
FRONTEND_URL=http://localhost
UPI_ID="yourbusiness@upi"
NODE_ENV=production
ENVEOF
  info "backend/.env created"
else
  warn "backend/.env already exists — skipping overwrite. Ensure DATABASE_URL is correct."
fi

# ── 9. Install dependencies ───────────────────────────────────────────────────
section "Installing backend dependencies"
cd "$APP_DIR/backend"
npm ci --omit=dev

section "Installing frontend dependencies"
cd "$APP_DIR/frontend"
npm ci

# ── 10. Prisma migrate + seed ─────────────────────────────────────────────────
section "Running Prisma migrations"
cd "$APP_DIR/backend"
npx prisma migrate deploy

section "Seeding database"
npx prisma db seed

# ── 11. Build frontend ────────────────────────────────────────────────────────
section "Building frontend"
cd "$APP_DIR/frontend"
npm run build
info "Frontend built → ${APP_DIR}/frontend/dist"

# ── 12. Configure Nginx ───────────────────────────────────────────────────────
section "Configuring Nginx"
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/water-erp
ln -sf /etc/nginx/sites-available/water-erp /etc/nginx/sites-enabled/water-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 13. Start backend with PM2 ────────────────────────────────────────────────
section "Starting backend with PM2"
cd "$APP_DIR"
pm2 delete water-erp-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Register PM2 to start on reboot
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root | tail -1)
eval "$PM2_STARTUP" || true
pm2 save

# ── 14. Firewall ──────────────────────────────────────────────────────────────
section "Configuring UFW firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 15. Summary ───────────────────────────────────────────────────────────────
section "Deployment complete"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo -e "
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
  App URL   : http://${SERVER_IP}
  API health: http://${SERVER_IP}/api/health  (should return {status:'ok'})

  DB name   : ${DB_NAME}
  DB user   : ${DB_USER}
  DB pass   : ${DB_PASS}   ← save this securely!

  Default admin login: admin / admin123
  !! Change the admin password after first login !!

  PM2 status: pm2 status
  Nginx logs: tail -f /var/log/nginx/error.log
  App logs  : pm2 logs water-erp-api
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
"
