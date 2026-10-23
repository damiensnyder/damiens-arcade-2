#!/bin/bash
# Deploys whatever is checked out. Run after `git pull`:
#     bash scripts/start.sh
# The server runs as the systemd service damiens-arcade-2 (see
# scripts/damiens-arcade-2.service) using the Node install in /opt/node;
# logs: journalctl -u damiens-arcade-2
set -e

DIR=/home/damiens-arcade-2
export PATH=/opt/node/bin:$PATH

echo "==> Installing dependencies..."
npm --prefix "$DIR" ci

echo "==> Building..."
npm --prefix "$DIR" run build

echo "==> Restarting server..."
systemctl restart damiens-arcade-2
systemctl is-active damiens-arcade-2

echo "==> Done! damiens-arcade-2 is running on port 3000"
