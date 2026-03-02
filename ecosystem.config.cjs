module.exports = {
  apps: [
    {
      name: 'damiens-arcade-2',
      script: 'node_modules/.bin/tsx',
      args: 'src/server/index.ts',
      cwd: '/home/damiens-arcade-2',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
