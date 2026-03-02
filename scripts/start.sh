#!/bin/bash
set -e

DIR=/home/damiens-arcade-2

echo "==> Installing dependencies..."
npm --prefix "$DIR" install

echo "==> Building..."
npm --prefix "$DIR" run build

echo "==> Restarting server..."
if pm2 describe damiens-arcade-2 > /dev/null 2>&1; then
  pm2 restart damiens-arcade-2
else
  pm2 start "$DIR/ecosystem.config.cjs"
fi
pm2 save

echo "==> Done! damiens-arcade-2 is running on port 3000"
