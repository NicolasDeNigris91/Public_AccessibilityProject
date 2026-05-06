import { test, expect, type APIRequestContext } from "@playwright/test";

const API = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

/**
 * Magic-link sign-in happy path.
 *
 * Requires the backend running with NODE_ENV !== "production" so the
 * test-only hatch GET /api/auth/__test/last-link is mounted and the
 * LastLinkCapture sender wrapper is wired. We probe the hatch up-front
 * and skip cleanly in environments that don't expose it (CI without an
 * API container, etc.) so this spec doesn't redden a frontend-only run.
 */
async function hatchAvailable(req: APIRequestContext): Promise<boolean> {
  try {
    const res = await req.get(`${API}/api/auth/__test/last-link?email=probe@example.com`);
    // 404 with `{ link: null }` means the hatch is mounted but no link yet.
    // 404 without that body means the route doesn't exist (production).
    if (res.status() === 404) {
      const body = await res.json().catch(() => ({}));
      return body && Object.prototype.hasOwnProperty.call(body, "link");
    }
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("magic-link sign-in", () => {
  test("user can request a link, verify it, and see their email in the header", async ({
    page,
    request,
  }) => {
    test.skip(
      !(await hatchAvailable(request)),
      `Backend test hatch /api/auth/__test/last-link not reachable at ${API}. ` +
        `Start backend with NODE_ENV=development to run this spec.`
    );

    const email = `playwright+${Date.now()}@example.com`;

    // 1. Submit the email via the form.
    await page.goto("/entrar");
    await page.getByLabel(/seu email/i).fill(email);
    await page.getByRole("button", { name: /enviar link mágico/i }).click();
    await expect(page).toHaveURL(/\/entrar\/check$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/verifique/i);

    // 2. Pull the latest magic link out of the test capture.
    const cap = await request.get(
      `${API}/api/auth/__test/last-link?email=${encodeURIComponent(email)}`
    );
    expect(cap.ok()).toBeTruthy();
    const { link } = (await cap.json()) as { link: string };
    expect(link).toMatch(/\/api\/auth\/verify\?token=/);

    // 3. Navigate to the link → backend sets the cookie + 302s to /app.
    await page.goto(link);
    await expect(page).toHaveURL(/\/app$/);

    // 4. Header pill reflects the new session.
    await expect(page.getByText(email)).toBeVisible();
  });

  test("verify-from-web-origin redirect bounces back to the API verify route", async ({
    page,
    request,
  }) => {
    test.skip(
      !(await hatchAvailable(request)),
      `Backend test hatch /api/auth/__test/last-link not reachable at ${API}.`
    );

    const email = `playwright-bounce+${Date.now()}@example.com`;

    // Seed a link by submitting the form first, then strip the API origin
    // so we can simulate someone landing on the web /entrar/verify route.
    await page.goto("/entrar");
    await page.getByLabel(/seu email/i).fill(email);
    await page.getByRole("button", { name: /enviar link mágico/i }).click();
    await expect(page).toHaveURL(/\/entrar\/check$/);

    const cap = await request.get(
      `${API}/api/auth/__test/last-link?email=${encodeURIComponent(email)}`
    );
    const { link } = (await cap.json()) as { link: string };
    const token = new URL(link).searchParams.get("token");
    expect(token).toBeTruthy();

    // Visit the web origin's verify helper page — should bounce to API.
    await page.goto(`/entrar/verify?token=${encodeURIComponent(token!)}`);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(email)).toBeVisible();
  });
});
