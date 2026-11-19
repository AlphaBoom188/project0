#!/bin/bash
# Runs the Expense Tracker on this Mac as background services (LaunchAgents):
#   com.expensetracker.backend    node backend/index.js   (restarts on crash, starts at login)
#   com.expensetracker.tunnel     ngrok http --url=<domain> 3000
#   com.expensetracker.keepawake  caffeinate -s -i         (no sleep while on power)
#   com.expensetracker.logrotate  daily 03:30: rotate logs, delete copies older than 30 days
# Usage: deploy/macos/install.sh <your-ngrok-static-domain>
#   e.g. deploy/macos/install.sh slacked-secrecy-gratify.ngrok-free.dev
# Stop anything you started by hand first (the backend terminal, ngrok) -- port 3000 must be free.
# Logs: ~/Library/Logs/expense-tracker/   Undo: deploy/macos/uninstall.sh
set -euo pipefail
DOMAIN="${1:?usage: $0 <ngrok-static-domain>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NODE="$(command -v node)" || { echo "node not found on PATH"; exit 1; }
NGROK="$(command -v ngrok)" || { echo "ngrok not found on PATH"; exit 1; }
LOGS="$HOME/Library/Logs/expense-tracker"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LOGS" "$AGENTS"
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is in use (a backend started by hand?). Stop it, then run this again."; exit 1
fi
for name in backend tunnel keepawake logrotate; do
  target="$AGENTS/com.expensetracker.$name.plist"
  sed -e "s#__NODE__#$NODE#g" -e "s#__NGROK__#$NGROK#g" -e "s#__REPO__#$REPO#g" -e "s#__LOGS__#$LOGS#g" \
      -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__HOME__#$HOME#g" -e "s#__PATH__#$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin#g" \
      "$HERE/$name.plist.template" > "$target"
  launchctl bootout "gui/$(id -u)" "$target" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$target"
  echo "started com.expensetracker.$name"
done
sleep 5
if curl -fsS "http://localhost:3000/health" >/dev/null; then echo "backend healthy on :3000"; else echo "backend not healthy yet: see $LOGS/backend.err.log"; fi
echo "public URL: https://$DOMAIN/health"
