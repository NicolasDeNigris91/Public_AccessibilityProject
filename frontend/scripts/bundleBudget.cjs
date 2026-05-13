#!/usr/bin/env node
/**
 * Bundle budget gate. Reads .next/app-build-manifest.json + the static chunk
 * sizes on disk and fails the build when the gzipped first-load JS for any
 * route exceeds the limit defined below. Lifting the limit means amending
 * this file with the new number and saying why in the PR description.
 *
 * Why a script instead of next.config: Next 14 doesn't have a first-class
 * "fail build if bundle > X" knob. webpack performance hints look at the
 * non-gzipped emit size, which over-counts.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const FRONTEND_ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(FRONTEND_ROOT, ".next");

// Per-route gzipped first-load JS budget. Tighten as the app shrinks.
const ROUTE_BUDGET_KB = {
  "/": 130,
  "/aprender": 120,
  "/app": 160,
  "/audits/[id]": 160,
  "/entrar": 130,
  "/entrar/check": 130,
  "/entrar/verify": 130,
};

function gzippedSizeBytes(absPath) {
  const raw = fs.readFileSync(absPath);
  return zlib.gzipSync(raw, { level: 9 }).length;
}

function readManifest() {
  const manifestPath = path.join(NEXT_DIR, "app-build-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`bundle:check missing ${manifestPath}; run 'next build' first.`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function chunkSize(chunkRelPath) {
  const abs = path.join(NEXT_DIR, chunkRelPath);
  if (!fs.existsSync(abs)) return 0;
  return gzippedSizeBytes(abs);
}

function main() {
  const manifest = readManifest();
  const pages = manifest.pages ?? {};
  let failed = false;
  const rows = [];

  for (const [route, budgetKb] of Object.entries(ROUTE_BUDGET_KB)) {
    // Root route's manifest key is `/page`, not `//page`.
    const pageKey = route === "/" ? "/page" : `${route}/page`;
    const chunks = pages[pageKey] ?? pages[route] ?? [];
    if (chunks.length === 0) {
      rows.push({ route, gzippedKb: "n/a", budgetKb, status: "skipped" });
      continue;
    }
    const totalBytes = chunks.reduce((sum, rel) => sum + chunkSize(rel), 0);
    const totalKb = +(totalBytes / 1024).toFixed(1);
    const ok = totalKb <= budgetKb;
    if (!ok) failed = true;
    rows.push({
      route,
      gzippedKb: totalKb,
      budgetKb,
      status: ok ? "ok" : "OVER",
    });
  }

  console.log("Route                     gzipped   budget   status");
  console.log("------------------------- -------   ------   ------");
  for (const r of rows) {
    console.log(
      `${r.route.padEnd(25)} ${String(r.gzippedKb).padStart(7)}   ${String(r.budgetKb).padStart(
        6
      )}   ${r.status}`
    );
  }

  if (failed) {
    console.error("\nbundle:check FAILED — at least one route is over its budget.");
    process.exit(1);
  }
  console.log("\nbundle:check OK.");
}

main();
