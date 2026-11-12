// Configuration PM2 : `pm2 start ecosystem.config.js`
module.exports = {
  apps: [
    {
      name: 'zhaak-bot',
      script: 'src/index.js',
      instances: 1, // ne jamais depasser 1 : un bot Discord ne se clusterise pas comme ca
      autorestart: true,
      max_memory_restart: '400M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
