#!/bin/bash
# Script to capture terminal output to a log file
# Usage: ./scripts/capture-logs.sh

LOG_FILE="backend-errors.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting log capture..." >> "$LOG_FILE"
echo "All terminal output will be logged to: $LOG_FILE"
echo ""

# Run expo start and capture all output
npm exec expo start 2>&1 | tee -a "$LOG_FILE"



