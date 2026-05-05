# Runbooks

Operational playbooks for the recurring failure modes Euthus has been
designed to handle. Each one starts with **Symptoms** so you can match
on a Grafana panel, then **Diagnosis** (what to check, in what order),
then **Mitigation** (the smallest action that restores service), then
**Follow-up** (what the postmortem should consider).

| File                                                     | Use when                                           |
| -------------------------------------------------------- | -------------------------------------------------- |
| [worker-stuck.md](./worker-stuck.md)                     | Worker alive but no jobs progress                  |
| [queue-overflow.md](./queue-overflow.md)                 | `audit_queue_depth{wait}` climbing without bound   |
| [puppeteer-crashloop.md](./puppeteer-crashloop.md)       | Chromium relaunching repeatedly                    |
| [dns-rebinding-incident.md](./dns-rebinding-incident.md) | A submission tries to pivot to a private IP        |
| [rollback.md](./rollback.md)                             | A bad release is in production and needs reverting |

Conventions:

- Every runbook is opinionated. If two paths are reasonable, pick one
  and explain why.
- "Mitigation" is the action you take _now_. Long-term fixes go to
  "Follow-up".
- Don't add a runbook before you've actually had the incident at least
  once or built the tooling that makes it inevitable. A runbook for an
  imagined failure mode rots before it pays off.
