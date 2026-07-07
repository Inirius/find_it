#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '\n[deploy] %s\n' "$1"
}

log "Pull latest code"
git pull --ff-only

log "Remove stale frontend dependencies"
rm -rf node_modules

log "Remove stale backend dependencies"
rm -rf server/node_modules

log "Install frontend dependencies"
npm ci

log "Install backend dependencies"
cd server
npm ci

log "Build frontend for production"
cd "$SCRIPT_DIR"
VITE_API_BASE_URL="https://find-it-here.fr" npm run build

log "Restart backend service"
sudo systemctl restart find-it-server

log "Reload Caddy"
sudo systemctl reload caddy

log "Deployment completed"