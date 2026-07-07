#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '\n[deploy] %s\n' "$1"
}

repair_node_modules_ownership() {
  local target_dir="$1"

  if [ -d "$target_dir" ]; then
    sudo chown -R "$(id -un)":"$(id -gn)" "$target_dir"
  fi
}

log "Pull latest code"
git pull --ff-only

log "Fix frontend dependencies ownership if needed"
repair_node_modules_ownership node_modules

log "Fix backend dependencies ownership if needed"
repair_node_modules_ownership server/node_modules

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