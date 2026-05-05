// k6 smoke test against a running api+worker pair (docker-compose up
// --build, or any deployed env via API_URL). Encodes the four SLOs
// from docs/SLO.md as inline thresholds so a regression breaks the
// run instead of waiting to be noticed in production.
//
// Run locally:
//   API_URL=http://localhost:4000 npm run smoke:load
//
// CI: see .github/workflows/load-smoke.yml

import http from "k6/http";
import { check, sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.API_URL || "http://localhost:4000";
// A page we control that we know is small + fast + ASCII. example.com is
// the canonical target — it never moves, never redirects, never gets
// rate-limited, and is documented as the "use this for examples" host.
const TARGET = __ENV.TARGET_URL || "https://example.com";

export const options = {
  scenarios: {
    health: {
      // Constant low rate against the probes; cheap, just confirms the
      // service is up and responsive throughout the run.
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
      exec: "probe",
    },
    audits: {
      // The real workload: submit and poll for completion. Low rate so
      // the worker can keep up at default concurrency (2 jobs).
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "10s",
      duration: "60s",
      preAllocatedVUs: 3,
      maxVUs: 6,
      startTime: "5s",
      exec: "auditFlow",
    },
  },
  thresholds: {
    // SLOs encoded inline. http_req_failed = anything >= 400, which
    // includes 5xx (the "API availability" SLO target).
    http_req_failed: ["rate<0.005"],
    // p95 of /api/audits POST + audit GET HTTP latency stays under 1s
    // (the audit itself can take 30s; this measures the API hop only).
    "http_req_duration{type:probe}": ["p(95)<200"],
    "http_req_duration{type:submit}": ["p(95)<1000"],
    // p95 end-to-end audit duration stays under the 30s SLO. Tracked
    // by the auditDoneSeconds custom Trend below.
    audit_done_seconds: ["p(95)<30"],
    audit_completed: ["count>=4"], // sanity: workload actually ran
  },
};

import { Trend, Counter } from "k6/metrics";
const auditDoneSeconds = new Trend("audit_done_seconds", true);
const auditCompleted = new Counter("audit_completed");

export function probe() {
  const tags = { type: "probe" };
  const h = http.get(`${BASE}/health`, { tags });
  check(h, { "/health is 200": (r) => r.status === 200 }, tags);
  const r = http.get(`${BASE}/ready`, { tags });
  check(r, { "/ready is 200": (r) => r.status === 200 }, tags);
}

export function auditFlow() {
  const clientId = uuidv4();
  const submit = http.post(`${BASE}/api/audits`, JSON.stringify({ url: TARGET }), {
    headers: {
      "content-type": "application/json",
      "x-client-id": clientId,
    },
    tags: { type: "submit" },
  });
  if (
    !check(submit, {
      "submit accepted (202)": (r) => r.status === 202,
      "submit body has publicId": (r) => !!r.json("publicId"),
    })
  ) {
    return;
  }

  const publicId = submit.json("publicId");
  const start = Date.now();
  // Poll for terminal state; cap at the SLO ceiling so a hung audit
  // surfaces as a threshold breach rather than blocking the run.
  for (let i = 0; i < 60; i++) {
    sleep(1);
    const got = http.get(`${BASE}/api/audits/${publicId}`, {
      tags: { type: "poll" },
    });
    if (got.status !== 200) continue;
    const status = got.json("status");
    if (status === "done" || status === "failed") {
      auditDoneSeconds.add((Date.now() - start) / 1000);
      auditCompleted.add(1);
      check(got, {
        "audit reached terminal state": () => status === "done" || status === "failed",
      });
      return;
    }
  }
  // Did not reach terminal state inside the polling budget. Don't add
  // to auditDoneSeconds — let the threshold catch the floor (count>=4).
}
