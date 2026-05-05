#!/usr/bin/env bash
# Chaos drill: restart mongo mid-flight, observe in-flight audits move
# to `failed`, then verify recovery and resubmittability.
#
# Pre-req: docker compose up --build is running in another shell.
# Expected outcome: see tests/chaos/README.md.

set -euo pipefail

API="${API_URL:-http://localhost:4000}"

probe() {
  curl -s -o /dev/null -w "%{http_code}" "$API/ready" || echo "ERR"
}

echo "[chaos] before: /ready = $(probe)"

echo "[chaos] submitting an audit so there's something in flight..."
CLIENT_ID="$(uuidgen | tr 'A-Z' 'a-z')"
SUBMIT=$(curl -s -X POST "$API/api/audits" \
  -H "content-type: application/json" \
  -H "x-client-id: $CLIENT_ID" \
  -d '{"url":"https://example.com"}')
PUBLIC_ID=$(printf '%s' "$SUBMIT" | grep -oE '"publicId":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "[chaos] submitted publicId=$PUBLIC_ID"

echo "[chaos] restarting mongo..."
docker compose restart mongo

# Give the api a few cycles to notice the disconnect.
sleep 3
echo "[chaos] during: /ready = $(probe) (expect 503)"

# Wait for mongo to come back; mongoose auto-reconnects.
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  status=$(probe)
  if [ "$status" = "200" ]; then
    echo "[chaos] mongo back, /ready = 200 after ${i}s"
    break
  fi
  sleep 1
done

echo "[chaos] resubmitting same URL — should accept under fresh publicId"
RESUBMIT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/audits" \
  -H "content-type: application/json" \
  -H "x-client-id: $CLIENT_ID" \
  -d '{"url":"https://example.com"}')
if [ "$RESUBMIT" = "202" ]; then
  echo "[chaos] PASS: resubmission accepted"
  exit 0
else
  echo "[chaos] FAIL: resubmission returned $RESUBMIT"
  exit 1
fi
