# Architecture Decision Records

ADRs capture _why_ we made a non-obvious technical decision. Format:
[Michael Nygard's](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions),
short and dated.

| #    | Title                                                                                   |
| ---- | --------------------------------------------------------------------------------------- |
| 0001 | [Clean architecture layering](./0001-clean-architecture-layering.md)                    |
| 0002 | [`publicId` as share token, no auth on report read](./0002-publicId-as-share-token.md)  |
| 0003 | [SSRF defense in depth without full Chromium pinning](./0003-ssrf-defense-in-depth.md)  |
| 0004 | [End-to-end tracing via OpenTelemetry, OTLP/HTTP only](./0004-opentelemetry-tracing.md) |

When a decision changes, write a _new_ ADR that supersedes the old one
(don't edit history). Keep the old one with `Status: Superseded by 000N`.
