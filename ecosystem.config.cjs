module.exports = {
  apps: [
    {
      name: 'kairos-agent',
      script: 'npx',
      args: 'tsx src/agent/index.ts',
      cwd: '/opt/kairos',
      env: {
        NODE_ENV: 'production',
        MODE: 'live',
        PORT: '3000',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      autorestart: true,

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/opt/kairos/logs/error.log',
      out_file: '/opt/kairos/logs/out.log',
      merge_logs: true,
      max_size: '50M',

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 8000,
      shutdown_with_message: true,

      // Memory guard — restart if agent exceeds 512MB
      max_memory_restart: '512M',
    },
  ],
};
