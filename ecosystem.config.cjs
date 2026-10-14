module.exports = {
  apps: [{
    name: 'one-good-thing',
    script: 'src/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env: { NODE_ENV: 'production' }
  }]
};
