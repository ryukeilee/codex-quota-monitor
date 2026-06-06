#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Checking local Codex quota..."
node ./src/cli.js || true
echo "Saved latest status to: $SCRIPT_DIR/data/latest-dashboard.txt"
echo ""

mkdir -p "$SCRIPT_DIR/logs"

echo "Starting Codex Monitor in background..."
nohup npx electron . > "$SCRIPT_DIR/logs/electron.log" 2>&1 &
echo "Codex Monitor started (PID: $!)"
echo "Logs: $SCRIPT_DIR/logs/electron.log"
echo ""
echo "You can safely close this terminal — the app keeps running in the menu bar."
