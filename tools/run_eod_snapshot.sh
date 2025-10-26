#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/Users/lewistawney/market_insights"
VENV_DIR="$BASE_DIR/venv"
LOG_FILE="$BASE_DIR/logs/eod_snapshot.log"
ALERT_LOG="$BASE_DIR/logs/eod_snapshot_alerts.log"
SNAPSHOT_FILE="$BASE_DIR/snapshots/sectors_volume_latest.json"
MAX_AGE_SECONDS=$((24 * 60 * 60))

# Activate virtual environment
if [ -f "$VENV_DIR/bin/activate" ]; then
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
else
  echo "Virtual environment not found at $VENV_DIR" >&2
  exit 1
fi

cd "$BASE_DIR"

timestamp() {
  date +"%Y-%m-%d %H:%M:%S"
}

echo "$(timestamp) Starting EOD snapshot..." >> "$LOG_FILE" 2>&1
if python -m server.jobs.eod_snapshot >> "$LOG_FILE" 2>&1; then
  echo "$(timestamp) Snapshot completed successfully." >> "$LOG_FILE"

  if [ -f "$SNAPSHOT_FILE" ]; then
    if stat -f "%m" "$SNAPSHOT_FILE" >/dev/null 2>&1; then
      mtime=$(stat -f "%m" "$SNAPSHOT_FILE")
    else
      mtime=$(stat -c "%Y" "$SNAPSHOT_FILE")
    fi
    now=$(date +%s)
    age=$((now - mtime))
    if [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
      message="$(timestamp) ALERT: Snapshot older than 24h (age ${age}s)."
      echo "$message" | tee -a "$LOG_FILE" >> "$ALERT_LOG"
    fi
  else
    message="$(timestamp) ALERT: Snapshot file missing after run."
    echo "$message" | tee -a "$LOG_FILE" >> "$ALERT_LOG"
  fi
else
  status=$?
  message="$(timestamp) ALERT: Snapshot FAILED with exit code $status."
  echo "$message" | tee -a "$LOG_FILE" >> "$ALERT_LOG"
  exit $status
fi
