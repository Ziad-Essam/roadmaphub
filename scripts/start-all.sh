#!/usr/bin/env bash
# Starts the three services and the gateway on this PC (Git Bash or Linux), each as its own process.
#   bash scripts/start-all.sh            1 replica of each service
#   REPLICAS=3 bash scripts/start-all.sh 3 replicas of each service (for the k6 scaling test)
# Logs: .run/<name>.log   Stop: bash scripts/stop-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .run
# Floci settings (not secrets)
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}" AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export NODE_ENV="${NODE_ENV:-development}"
# Services talk to each other through the internal gateway (like an internal load balancer)
export ROADMAP_URL=http://127.0.0.1:8081 ENGAGEMENT_URL=http://127.0.0.1:8081 ADMIN_URL=http://127.0.0.1:8081
REPLICAS="${REPLICAS:-1}"

start() { # start <name> <script> [VAR=value ...]
  local name="$1" script="$2"; shift 2
  env "$@" node "$script" > ".run/$name.log" 2>&1 &
  echo $! > ".run/$name.pid"
  echo "  started $name (pid $!)"
}

targets() { # targets <basePort>
  local list=""
  for i in $(seq 0 $((REPLICAS - 1))); do list="$list${list:+,}http://127.0.0.1:$(( $1 + i * 10 ))"; done
  echo "$list"
}

for i in $(seq 0 $((REPLICAS - 1))); do
  start "roadmap-$i"    services/roadmap-service/server.js    PORT=$((3001 + i * 10)) SERVICE_NAME=roadmap
  start "engagement-$i" services/engagement-service/server.js PORT=$((3002 + i * 10)) SERVICE_NAME=engagement
  start "admin-$i"      services/admin-service/server.js      PORT=$((3003 + i * 10)) SERVICE_NAME=admin
done
# Wait until every service answers /health before the load balancer starts sending traffic
for port in $(seq 3001 3003); do
  for i in $(seq 0 $((REPLICAS - 1))); do
    p=$((port + i * 10))
    for try in $(seq 1 50); do curl -sf "http://127.0.0.1:$p/health" >/dev/null && break; sleep 0.2; done
  done
done
start gateway gateway/server.js PUBLIC_PORT=8080 INTERNAL_PORT=8081 STATIC_DIR=frontend \
  ROADMAP_TARGETS="$(targets 3001)" ENGAGEMENT_TARGETS="$(targets 3002)" ADMIN_TARGETS="$(targets 3003)"

sleep 1
echo
curl -s http://localhost:8080/api/health && echo
echo "  Website + API: http://localhost:8080   (logs in .run/)"
