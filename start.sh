#!/bin/bash

# Production startup script for Market Insights API

set -e

# Default values
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}
WORKERS=${WORKERS:-4}
LOG_LEVEL=${LOG_LEVEL:-info}

echo "Starting Market Insights API..."
echo "Host: $HOST"
echo "Port: $PORT"
echo "Workers: $WORKERS"
echo "Log Level: $LOG_LEVEL"

# Check if config file exists
if [ ! -f "config.yaml" ]; then
    echo "Warning: config.yaml not found, using config.example.yaml"
    if [ -f "config.example.yaml" ]; then
        cp config.example.yaml config.yaml
    else
        echo "Error: No configuration file found"
        exit 1
    fi
fi

# Start the application
exec uvicorn app.main:app \
    --host "$HOST" \
    --port "$PORT" \
    --workers "$WORKERS" \
    --log-level "$LOG_LEVEL" \
    --access-log \
    --no-use-colors
