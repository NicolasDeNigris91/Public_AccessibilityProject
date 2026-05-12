---
"backend": patch
"frontend": patch
---

Upgrade OpenTelemetry stack and override `protobufjs` to clear all
production high-severity advisories. After this change,
`npm audit --workspace backend --omit=dev` reports
`found 0 vulnerabilities`.

- `@opentelemetry/auto-instrumentations-node` `^0.74.0` → `^0.75.0`,
  `@opentelemetry/sdk-node` `^0.216.0` → `^0.217.0`, and
  `@opentelemetry/exporter-trace-otlp-http` `^0.216.0` → `^0.217.0`.
  Closes GHSA-q7rr-3cgh-j5r3 (high): Prometheus exporter process
  crash via malformed HTTP request.
- Override `protobufjs` → `^8.0.3` at the root.
  `@opentelemetry/otlp-transformer@0.217.0` pins `"protobufjs": "8.0.1"`
  exactly. The advisory range is `>=8.0.0 <=8.0.1` and upstream has
  published 8.0.2 / 8.0.3 / 8.2.0 outside it. The override forces the
  install to 8.2.0, the latest non-vulnerable release, closing
  GHSA-q6x5-8v7m-xcrf (overlong UTF-8 decoding), GHSA-2pr8-phx7-x9h3
  (DoS via crafted field names), GHSA-66ff-xgx4-vchm (code injection
  via bytes field defaults), GHSA-fx83-v9x8-x52w (prototype injection
  in generated constructors), GHSA-75px-5xx7-5xc7 (code-gen gadget
  after prototype pollution), GHSA-jvwf-75h9-cwgg (DoS via unsafe
  option paths), and GHSA-685m-2w69-288q (DoS via unbounded
  recursion).

Also implicitly resolves the `Dependabot Updates` daily failure on
the protobufjs advisory: with `protobufjs` installed at 8.2.0, the
security scan is a no-op rather than `fix_available: false`.

When upstream `@opentelemetry/otlp-transformer` bumps its `protobufjs`
dep to a non-pinned caret range (or pins to a non-vulnerable
version), the override becomes inert and can be removed.
