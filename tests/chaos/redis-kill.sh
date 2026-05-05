#!/usr/bin/env bash
# Chaos drill: stop redis for 30 s while audits are in flight, observe
# /ready flips to 503, then verify recovery.
#
# Pre-req: docker compose up --build is running in another shell.
# Expected outcome: see tests/chaos/README.md.

set -euo pipefail

API="${API_URL:-http://localhost:4000}"

probe() {
  curl -s -o /dev/null -w "%{http_code}" "$API/ready" || echo "ERR"
}

echo "[chaos] before: /ready = $(probe)"

echo "[chaos] stopping redis..."
docker compose stop redis

# Give the api a few cycles to notice.
sleep 3
echo "[chaos] during: /ready = $(probe) (expect 503)"

echo "[chaos] sleeping 30 s under failure..."
sleep 30

echo "[chaos] starting redis..."
docker compose start redis

# Recovery is asynchronous; ioredis reconnects within a few seconds.
for i in 1 2 3 4 5 6 7 8 9 10; do
  status=$(probe)
  if [ "$status" = "200" ]; then
    echo "[chaos] recovered: /ready = 200 after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "[chaos] FAIL: /ready did not recover within 10 s"
exit 1
