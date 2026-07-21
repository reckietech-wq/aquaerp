module.exports = {
  apps: [
    {
      name: 'water-erp-api',
      script: 'backend/src/index.js',

      // Use both vCPUs on Hostinger KVM 2
      instances: 2,
      exec_mode: 'cluster',

      // Restart if memory exceeds 500 MB
      max_memory_restart: '500M',

      // Restart strategy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 4000,

      // backend/src/index.js loads backend/.env via require('dotenv').config()
      // so we only need to tell PM2 the runtime environment flag here
      env_production: {
        NODE_ENV: 'production',
      },

      // PM2 log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/water-erp-error.log',
      out_file: '/var/log/pm2/water-erp-out.log',
      merge_logs: true,
    },
  ],
};
