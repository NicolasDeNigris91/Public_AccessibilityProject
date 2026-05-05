import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Self-a11y: the tool that audits other people's a11y must itself pass
 * axe. WCAG 2.2 AA is the declared target (see docs/QUALITY-AUDIT.md
 * Phase 3); for now we gate any new "serious" or "critical" violation.
 */
const ROUTES = ["/", "/aprender", "/app"];

for (const path of ROUTES) {
  test(`route ${path} has no critical or serious axe violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = result.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );

    if (blocking.length > 0) {
      // Surface the failing rule ids so CI logs are actionable.
      console.error(
        `axe violations on ${path}:`,
        blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))
      );
    }
    expect(blocking).toHaveLength(0);
  });
}
