#!/usr/bin/env bash
# Stops everything started by start-all.sh. Data in Floci is kept.
cd "$(dirname "$0")/.."
for f in .run/*.pid; do
  [ -f "$f" ] || continue
  kill "$(cat "$f")" 2>/dev/null && echo "  stopped $(basename "$f" .pid)"
  rm -f "$f"
done
