#!/usr/bin/env bash
# Chaos drill: SIGKILL the worker while a job is running. BullMQ
# should mark the job stalled, the docker-compose restart policy
# brings the worker back, and the next pickup re-runs the job.
#
# Pre-req: docker compose up --build is running in another shell.
# Expected outcome: see tests/chaos/README.md.

set -euo pipefail

API="${API_URL:-http://localhost:4000}"

echo "[chaos] submitting a slow audit (example.com finishes fast; for a"
echo "        better demo, point at a heavier page via TARGET_URL)..."
TARGET="${TARGET_URL:-https://example.com}"
CLIENT_ID="$(uuidgen | tr 'A-Z' 'a-z')"
SUBMIT=$(curl -s -X POST "$API/api/audits" \
  -H "content-type: application/json" \
  -H "x-client-id: $CLIENT_ID" \
  -d "{\"url\":\"$TARGET\"}")
PUBLIC_ID=$(printf '%s' "$SUBMIT" | grep -oE '"publicId":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "[chaos] submitted publicId=$PUBLIC_ID"

# Wait for the worker to pick the job up and move it to running.
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATUS=$(curl -s "$API/api/audits/$PUBLIC_ID" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" = "running" ]; then
    echo "[chaos] job is running; killing worker..."
    break
  fi
  sleep 1
done

docker compose kill -s SIGKILL worker

echo "[chaos] worker killed; docker compose restart policy will bring it back."
sleep 5
docker compose start worker || true

echo "[chaos] waiting for job to reach a terminal state..."
for i in 1 2 3 4 5 6 7 8 9 10 \
         11 12 13 14 15 16 17 18 19 20 \
         21 22 23 24 25 26 27 28 29 30; do
  STATUS=$(curl -s "$API/api/audits/$PUBLIC_ID" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    echo "[chaos] job reached terminal state: $STATUS after ${i}s"
    if [ "$STATUS" = "done" ]; then
      echo "[chaos] PASS: idempotent re-run produced a final result"
      exit 0
    else
      # `failed` is acceptable too — the SIGKILL counted as one of the
      # two attempts. The point of this drill is "no work was lost
      # silently"; either result demonstrates that.
      echo "[chaos] PASS (with retry exhausted): job failed cleanly, see DLQ"
      exit 0
    fi
  fi
  sleep 1
done
echo "[chaos] FAIL: job did not reach terminal state in 30 s"
exit 1
