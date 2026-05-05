# Security Policy

## Supported Versions

Only the `main` branch receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| other   | :x:                |

## Reporting a Vulnerability

**Please do not report vulnerabilities via public GitHub issues.**

This project runs Puppeteer against arbitrary user-supplied URLs and
persists results to MongoDB. Be especially careful to report (privately)
any of:

- SSRF / URL-validation bypasses against the worker.
- Stored XSS or HTML injection in the dashboard.
- Auth or rate-limit bypasses on the API.
- Resource-exhaustion paths (queue flooding, Puppeteer hang).
- Sandbox-escape behavior in the worker container.

Email **nicolas.denigris91@icloud.com** with the subject line
`[SECURITY] AccessibilityProject: <short description>`.

Include:

- A description of the vulnerability and its impact.
- Reproduction steps (URL, payload, or minimal case).
- Affected commit SHA or tag.
- Your assessment of severity, if any.

## Response Timeline

- **Acknowledgement:** within 72 hours.
- **Initial assessment:** within 7 days.
- **Fix or mitigation:** target 30 days for confirmed vulnerabilities;
  longer for issues that require coordinated disclosure.

Researchers acting in good faith are credited (with permission) in the
release notes once a fix ships.

## Automated guardrails

The codebase ships several automated security checks (each defined in
its own GitHub Actions workflow):

- **CodeQL** (`security-and-quality` + `security-extended` query
  suites) on every PR and push to `main`, plus a weekly scheduled
  scan. Configuration: [.github/codeql/codeql-config.yml](.github/codeql/codeql-config.yml).
- **Custom CodeQL query** at
  [.github/codeql/queries/dns-outside-ssrf-boundary.ql](.github/codeql/queries/dns-outside-ssrf-boundary.ql)
  flags any `dns.lookup` / `dns.resolve*` call outside
  `assertSafeUrl.ts` and `resolveSafeAddress.ts` — preventing future
  changes from bypassing the SSRF policy described in
  [ADR 0003](docs/adr/0003-ssrf-defense-in-depth.md).
- **gitleaks** scans every push and runs as a pre-commit hook (when
  installed locally) so secrets caught locally never leave the
  workstation.
- **OSV-Scanner** + **`npm audit --omit=dev --audit-level=high`** on
  every PR fail the build on known-vulnerable production deps.
- **`npm audit signatures`** validates that every dependency in the
  lockfile carries a valid registry signature, catching typosquats
  with forged manifests.
