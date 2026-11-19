#!/bin/bash
# Stops and removes the Expense Tracker LaunchAgents installed by install.sh.
set -uo pipefail
for name in backend tunnel keepawake logrotate; do
  target="$HOME/Library/LaunchAgents/com.expensetracker.$name.plist"
  launchctl bootout "gui/$(id -u)" "$target" 2>/dev/null && echo "stopped com.expensetracker.$name"
  rm -f "$target"
done
