#!/bin/bash
# Daily log rotation for the Expense Tracker LaunchAgents (installed by install.sh
# as com.expensetracker.logrotate, runs at 03:30). Each *.log is copied to
# <name>.<YYYY-MM-DD> and truncated in place (launchd keeps the file open, and it
# appends), and rotated copies older than 30 days are deleted: the privacy policy
# promises server logs are kept for at most 30 days.
LOGS="$HOME/Library/Logs/expense-tracker"
[ -d "$LOGS" ] || exit 0
STAMP="$(date +%Y-%m-%d)"
for f in "$LOGS"/*.log; do
  [ -s "$f" ] || continue
  cp "$f" "$f.$STAMP" && : > "$f"
done
find "$LOGS" -name '*.log.*' -type f -mtime +30 -delete
