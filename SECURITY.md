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
