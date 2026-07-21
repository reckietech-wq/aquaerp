# AquaERP — Water Can Delivery Management System

A full-stack ERP for managing water can deliveries, drivers, clients, and invoicing.

---

## Tech Stack

- **Backend**: Node.js, Express, Prisma 6, PostgreSQL
- **Frontend**: React 18, Vite, Tailwind CSS v4, React Router v6

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or a cloud DB)

---

## Setup

### 1. Clone and install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment variables

**Backend** — copy and edit:
```bash
cp backend/.env.example backend/.env
```

Set your values in `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/water_erp"
JWT_SECRET="a-long-random-secret-string"
PORT=5000
FRONTEND_URL=http://localhost:5173
UPI_ID="yourbusiness@upi"
```

**Frontend** — the `.env` is already configured for local dev (uses Vite proxy):
```env
VITE_API_URL=
```

### 3. Set up the database

Create the database in PostgreSQL:
```sql
CREATE DATABASE water_erp;
```

Run migrations and seed the admin user:
```bash
cd backend
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Run in development

Open two terminals:

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# Server starts on http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm run dev
# App starts on http://localhost:5173
```

---

## Default Admin Credentials

| Field    | Value      |
|----------|------------|
| Login ID | `admin`    |
| Password | `admin123` |

**Change the password after first login.**

---

## API Overview

| Route prefix       | Access  | Description                   |
|--------------------|---------|-------------------------------|
| `POST /api/auth/login`  | Public  | Login, returns JWT token |
| `GET /api/auth/me`      | Any     | Get current user info    |
| `GET /api/dashboard`    | Admin   | Stats + recent deliveries|
| `GET /api/drivers`      | Admin   | List / manage drivers    |
| `GET /api/clients`      | Admin   | List / manage clients    |
| `GET /api/deliveries`   | Any     | Record deliveries        |
| `GET /api/invoices`     | Admin   | List / manage invoices   |
| `GET /api/driver/clients` | Driver | Driver's client list   |

---

## Project Structure

```
water-erp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # DB models
│   │   └── seed.js             # Seeds admin user
│   └── src/
│       ├── controllers/        # Business logic
│       ├── middleware/         # auth.js, errorHandler.js
│       ├── routes/             # Express routers
│       └── index.js            # App entry point
└── frontend/
    └── src/
        ├── context/            # AuthContext
        ├── layouts/            # AdminLayout, DriverLayout
        ├── pages/
        │   ├── admin/          # Dashboard, Drivers, Clients, Invoices
        │   └── driver/         # Driver dashboard
        └── components/         # DeliveryModal, InvoiceView, modals
```

---

## Deployment (Hostinger KVM 2 — Ubuntu 22.04)

### One-command deploy

Upload the project to your server, then:

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

The script:
1. Updates packages, installs Node.js 20 (via nvm), PostgreSQL 16, Nginx, PM2
2. Creates the `water_erp` database and a dedicated DB user with a random password
3. Writes `backend/.env` with auto-generated secrets (skips if file already exists)
4. Runs `npm ci`, `prisma migrate deploy`, `prisma db seed`
5. Builds the React frontend to `frontend/dist`
6. Installs Nginx config and starts PM2 in cluster mode (2 instances)
7. Configures UFW firewall (SSH + HTTP/HTTPS only)
8. Prints a summary with the DB password and app URL

### Post-deploy: set your domain

Edit `/etc/nginx/sites-available/water-erp` and replace `YOUR_DOMAIN_OR_IP` with your actual domain or server IP, then reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### HTTPS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### Useful commands

```bash
pm2 status                        # check all processes
pm2 logs water-erp-api            # live app logs
pm2 restart water-erp-api         # restart after code update
sudo tail -f /var/log/nginx/error.log  # Nginx errors
```

### Root-level npm scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start backend + frontend in dev mode (concurrently) |
| `npm run build` | Build React frontend to `frontend/dist` |
| `npm run migrate` | Run `prisma migrate deploy` in production |
| `npm run seed` | Run `prisma db seed` |
| `npm run start:prod` | Launch PM2 cluster from `ecosystem.config.js` |

---

## Production Notes

- Keep `JWT_SECRET`, `DATABASE_URL`, and DB password out of version control
- `VITE_API_URL` should stay empty in `frontend/.env` — Nginx proxies `/api` to port 5000
- PM2 cluster mode uses both vCPUs; max memory restart set at 500 MB per instance
- Logs: `error_file` and `out_file` go to `/var/log/pm2/`
