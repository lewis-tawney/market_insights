#!/bin/bash

# Development startup script for Market Insights API

set -e

echo "Starting Market Insights API in development mode..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Copy config if it doesn't exist
if [ ! -f "config.yaml" ]; then
    echo "Creating config.yaml from example..."
    cp config.example.yaml config.yaml
fi

# Start the application in development mode
echo "Starting development server..."
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
