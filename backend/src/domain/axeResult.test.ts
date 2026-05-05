import { buildAuditResult, toViolations, type AxeRawResult } from "./axeResult";

type AxeNode = AxeRawResult["violations"][number]["nodes"][number];

// Drop the optional key when undefined so exactOptionalPropertyTypes is happy.
const node = (target: string[], html: string, failureSummary?: string): AxeNode => {
  const n: AxeNode = { target, html };
  if (failureSummary !== undefined) n.failureSummary = failureSummary;
  return n;
};

const axeViolation = (
  overrides: Partial<AxeRawResult["violations"][number]> = {}
): AxeRawResult["violations"][number] => ({
  id: "color-contrast",
  impact: "serious",
  description: "Elements must meet minimum color contrast ratio thresholds",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
  tags: ["wcag2aa", "cat.color"],
  nodes: [node(["button"], "<button>ok</button>")],
  ...overrides,
});

const axeRaw = (overrides: Partial<AxeRawResult> = {}): AxeRawResult => ({
  violations: [],
  passes: [],
  ...overrides,
});

describe("toViolations", () => {
  it("maps all fields straight through", () => {
    const raw = axeRaw({ violations: [axeViolation()] });
    const [v] = toViolations(raw);
    expect(v).toEqual({
      id: "color-contrast",
      impact: "serious",
      description: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      tags: ["wcag2aa", "cat.color"],
      // failureSummary is omitted (not undefined) when axe did not provide one.
      nodes: [{ target: ["button"], html: "<button>ok</button>" }],
    });
  });

  it.each(["critical", "serious", "moderate", "minor"] as const)(
    "preserves impact %p verbatim",
    (impact) => {
      const [v] = toViolations(axeRaw({ violations: [axeViolation({ impact })] }));
      expect(v?.impact).toBe(impact);
    }
  );

  it("defaults null impact to minor so scoring stays bounded", () => {
    const [v] = toViolations(axeRaw({ violations: [axeViolation({ impact: null })] }));
    expect(v?.impact).toBe("minor");
  });

  it("preserves every node including failureSummary when present", () => {
    const [v] = toViolations(
      axeRaw({
        violations: [
          axeViolation({
            nodes: [
              node(["button.primary"], "<button class='primary'/>", "Fix the contrast"),
              node(["a.link"], "<a class='link'/>"),
            ],
          }),
        ],
      })
    );
    expect(v?.nodes).toHaveLength(2);
    expect(v?.nodes[0]?.failureSummary).toBe("Fix the contrast");
    expect(v?.nodes[1]?.failureSummary).toBeUndefined();
  });

  it("returns an empty list when axe reports no violations", () => {
    expect(toViolations(axeRaw())).toEqual([]);
  });

  it("preserves ordering across multiple violations", () => {
    const ids = toViolations(
      axeRaw({
        violations: [
          axeViolation({ id: "first" }),
          axeViolation({ id: "second" }),
          axeViolation({ id: "third" }),
        ],
      })
    ).map((v) => v.id);
    expect(ids).toEqual(["first", "second", "third"]);
  });
});

describe("buildAuditResult", () => {
  it("returns a perfect score and empty totals when axe finds nothing", () => {
    const out = buildAuditResult(axeRaw());
    expect(out).toEqual({
      score: 100,
      totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      violations: [],
      passes: 0,
    });
  });

  it("counts passes as the length of the axe passes array", () => {
    const out = buildAuditResult(axeRaw({ passes: [{}, {}, {}, {}, {}] }));
    expect(out.passes).toBe(5);
  });

  it("sums severity totals across multiple violations", () => {
    const out = buildAuditResult(
      axeRaw({
        violations: [
          axeViolation({ impact: "critical" }),
          axeViolation({
            impact: "serious",
            nodes: [node(["a"], "<a/>"), node(["b"], "<b/>")],
          }),
          axeViolation({ impact: "minor" }),
        ],
      })
    );
    expect(out.totals).toEqual({
      critical: 1,
      serious: 2,
      moderate: 0,
      minor: 1,
    });
  });

  it("penalises the score for a single critical violation", () => {
    const perfect = buildAuditResult(axeRaw());
    const withCritical = buildAuditResult(
      axeRaw({ violations: [axeViolation({ impact: "critical" })] })
    );
    expect(withCritical.score).toBeLessThan(perfect.score);
  });

  it("does not mutate the raw input", () => {
    const raw = axeRaw({ violations: [axeViolation()] });
    const snapshot = JSON.parse(JSON.stringify(raw));
    buildAuditResult(raw);
    expect(raw).toEqual(snapshot);
  });
});
