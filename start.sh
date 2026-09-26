#!/usr/bin/env bash
# Starts the Convex backend and the Vite dev server together.
# Kills any leftover instance from a previous run first, so re-running this
# never fails with "port already in use". Ctrl+C (or either process dying)
# stops both. Use ./stop.sh to stop them from another terminal.
cd "$(dirname "$0")"

echo "Checking for a previous run..."
./stop.sh >/dev/null 2>&1

cleanup() {
  echo ""
  echo "Stopping..."
  kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

npx convex dev &
CONVEX_PID=$!

npx vite &
VITE_PID=$!

# Portable stand-in for `wait -n` (not available in macOS's bash 3.2):
# poll until either process exits, then let the trap clean up the rest.
while kill -0 "$CONVEX_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 1
done
