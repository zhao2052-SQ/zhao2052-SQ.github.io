#!/usr/bin/env bash
# Start the local preview + visual editor.
#   ./edit.sh
# Then open http://localhost:4000 and edit. Changes save straight to content/.
set -euo pipefail
cd "$(dirname "$0")"

for port in 3000 4000; do
  pid="$(lsof -ti :"$port" 2>/dev/null | head -1 || true)"
  if [ -n "$pid" ]; then
    echo "Freeing port $port (pid $pid)"
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 2

# A stale .next directory left over from `npm run build` makes dev serve 500s.
rm -rf .next out

[ -d node_modules ] || npm install

npm run dev > /tmp/homepage-dev.log 2>&1 &
node editor/server.mjs > /tmp/homepage-editor.log 2>&1 &

printf 'Starting'
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null http://localhost:3000/ && curl -sf -o /dev/null http://localhost:4000/; then
    echo
    echo "Preview  http://localhost:3000"
    echo "Editor   http://localhost:4000"
    command -v open >/dev/null && open http://localhost:4000
    wait
    exit 0
  fi
  printf '.'
  sleep 2
done

echo
echo "Failed to start. Logs: /tmp/homepage-dev.log and /tmp/homepage-editor.log"
exit 1
