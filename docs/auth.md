# Soft auth (magic link)

Sign-in is **opt-in**. Anyone can submit and view audits anonymously
through the browser fingerprint (`X-Client-Id`); a magic-link sign-in
upgrades that browser to a persistent account that follows the user
across devices.

Design rationale lives in
[ADR 0005](./adr/0005-soft-auth-magic-link.md) (magic link over
password) and [ADR 0006](./adr/0006-session-tokens-in-mongo.md)
(opaque tokens in Mongo, not JWT).

## Routes

All under `/api/auth`.

| Method | Path          | What it does                                                                                                                                                                          |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/magic-link` | Body: `{ email }`. 202 on accept; 400 on invalid email; 429 on per-(ip,email) cap; 503 in prod when `EMAIL_PROVIDER` is unset. Sends the link via the configured sender.              |
| GET    | `/verify`     | Query: `token`. Atomically claims the link, upserts the User, creates a Session, sets the `euthus_session` cookie, 302s to `APP_REDIRECT_URL`. 401 on invalid/expired/replayed token. |
| GET    | `/me`         | `{ user: { id, email } }` when the cookie resolves; `{ user: null }` otherwise. Always 200.                                                                                           |
| POST   | `/logout`     | Clears the cookie and deletes the session row server-side. 204 even when called without a cookie.                                                                                     |

The session cookie is `euthus_session`, `HttpOnly`, `SameSite=Lax`,
`Secure` in production, `Path=/`, 30-day `Max-Age`. Optional `Domain`
attribute via `AUTH_COOKIE_DOMAIN` for multi-host deploys.

## Env vars

| Var                         | Default                     | Notes                                                                                 |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`            | _(unset)_                   | Set to `resend` to enable real email. Unset in prod → `/magic-link` 503s with a hint. |
| `RESEND_API_KEY`            | _(unset)_                   | Required when `EMAIL_PROVIDER=resend`.                                                |
| `EMAIL_FROM`                | _(unset)_                   | Required when `EMAIL_PROVIDER=resend`. Verified sender domain on Resend.              |
| `WEB_BASE_URL`              | `http://localhost:4000`     | Public URL of the **API**. Used to construct the magic-link URL the user clicks.      |
| `APP_REDIRECT_URL`          | `http://localhost:3000/app` | Where `/verify` 302s after setting the cookie. Should be the dashboard's full URL.    |
| `AUTH_COOKIE_DOMAIN`        | _(unset → host-only)_       | Set to a parent domain (e.g. `.euthus.com`) when API and web share a parent host.     |
| `AUTH_RATE_LIMIT_MAX`       | `5`                         | Max `/magic-link` requests per (ip, email) per window.                                |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `3600000` (1h)              | Window for the per-(ip, email) limit. The global IP limit still applies above this.   |
| `MAGIC_LINK_TTL_MS`         | `900000` (15min)            | How long a magic link is valid before `/verify` returns 401 `expired`.                |
| `SESSION_TTL_MS`            | `2592000000` (30d)          | Session cookie max-age and Mongo TTL on the `sessions` collection.                    |

## Local development

The default sender is `consoleSender`: every magic-link is logged with
the structured field `magic link issued`. Search the API log:

```bash
docker compose logs -f api | grep "magic link issued"
```

Click the URL printed in the log to complete the flow. The cookie
lands on `localhost`, so it's shared across :3000 (frontend) and :4000
(API) automatically.

For end-to-end tests, the backend exposes `GET /api/auth/__test/last-link?email=…`
**only when `NODE_ENV !== "production"`**. It returns the most recent
magic link captured by the in-process `LastLinkCapture` wrapper. The
Playwright auth spec uses this to read the link without a real inbox.

## Production setup (Resend)

1. Add a verified sender domain in the Resend dashboard.
2. Set the env on both `api` services:

   ```bash
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_…
   EMAIL_FROM="Euthus <hello@your-domain>"
   WEB_BASE_URL=https://api.your-domain
   APP_REDIRECT_URL=https://app.your-domain/app
   AUTH_COOKIE_DOMAIN=.your-domain        # only if api+web share a parent
   ```

3. Deploy. Hit `POST /api/auth/magic-link` with a payload `{ email: "you@your-domain" }`
   and confirm the link arrives.

If `EMAIL_PROVIDER` is left unset in production, `/magic-link` returns
503 with a structured `hint` pointing to this doc — by design, since
silently degrading to a console log of magic links would leak sign-in
links into a public log destination.

## Anonymous flow is preserved

`X-Client-Id` based scoping still works for every read and write. The
audit list endpoint switches between `userId` (when the session cookie
resolved) and `clientId` (otherwise). Audits POSTed while signed in
record both, so the `mergeAnonymousAudits` use case can attach prior
anonymous audits to the user account on first verify when an
`X-Client-Id` accompanies the verify request.

## Failure modes worth knowing

- **Token replay**: `/verify` is atomic via `findOneAndUpdate({ tokenHash, usedAt: null })`. The first claim wins; later attempts get 401 `already_used`.
- **Cookie not set on the right host**: confirm `WEB_BASE_URL` matches the API's public URL. The link in the email is `${WEB_BASE_URL}/api/auth/verify?token=…`; if it points at the wrong host the cookie lands somewhere the dashboard can't read.
- **CORS without credentials**: the frontend's `apiFetch` always sends `credentials: "include"`. The backend CORS config returns `Access-Control-Allow-Credentials: true`, so any change there breaks `/me` immediately.
