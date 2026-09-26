#!/usr/bin/env bash
# Stops any running instance of this app's dev server + local Convex backend
# started via ./start.sh, whether it's running in this terminal or another.
cd "$(dirname "$0")"
DIR="$(pwd)"

killed=0

# Anything (vite, convex dev, the convex-local-backend binary) whose command
# line references this project's directory.
pids=$(pgrep -f "$DIR" 2>/dev/null)
if [ -n "$pids" ]; then
  echo "$pids" | xargs kill 2>/dev/null
  killed=1
fi

# Ports this app uses: 5173 (vite default), 3210 (convex), 3211 (convex site proxy).
for port in 5173 3210 3211; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    killed=1
  fi
done

if [ "$killed" = "1" ]; then
  sleep 1
  echo "Stopped."
else
  echo "Nothing running."
fi
