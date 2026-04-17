import { render, screen } from "@testing-library/react";
import { ViolationCard } from "./ViolationCard";
import { copy } from "@/lib/copy";
import type { Violation } from "@/lib/types";

const violation = (overrides: Partial<Violation> = {}): Violation => ({
  id: "color-contrast",
  impact: "serious",
  description: "Elements must meet minimum color contrast ratio thresholds",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
  tags: ["wcag2aa"],
  nodes: [{ target: ["button"], html: "<button/>" }],
  ...overrides,
});

describe("ViolationCard", () => {
  it("renders the description as a heading", () => {
    render(<ViolationCard violation={violation()} />);
    expect(
      screen.getByRole("heading", {
        name: "Elements must meet minimum color contrast ratio thresholds",
      })
    ).toBeInTheDocument();
  });

  it("shows the severity label from copy", () => {
    render(<ViolationCard violation={violation({ impact: "critical" })} />);
    expect(screen.getByText(copy.severity.critical.label)).toBeInTheDocument();
  });

  it("shows the violation id in monospace", () => {
    render(<ViolationCard violation={violation({ id: "landmark-one-main" })} />);
    expect(screen.getByText("landmark-one-main")).toBeInTheDocument();
  });

  it("pluralises the affected-nodes count correctly", () => {
    const { rerender } = render(
      <ViolationCard
        violation={violation({ nodes: [{ target: ["a"], html: "<a/>" }] })}
      />
    );
    expect(screen.getByText(copy.report.affectedNodes(1))).toBeInTheDocument();

    rerender(
      <ViolationCard
        violation={violation({
          nodes: [
            { target: ["a"], html: "<a/>" },
            { target: ["b"], html: "<b/>" },
            { target: ["c"], html: "<c/>" },
          ],
        })}
      />
    );
    expect(screen.getByText(copy.report.affectedNodes(3))).toBeInTheDocument();
  });

  it("renders the human impact text from copy", () => {
    render(<ViolationCard violation={violation({ impact: "moderate" })} />);
    expect(
      screen.getByText(copy.severity.moderate.humanImpact)
    ).toBeInTheDocument();
  });

  it("links to the help URL in a new tab with safe rel", () => {
    render(<ViolationCard violation={violation()} />);
    const link = screen.getByRole("link", {
      name: new RegExp(copy.report.howToFix, "i"),
    });
    expect(link).toHaveAttribute(
      "href",
      "https://dequeuniversity.com/rules/axe/4.10/color-contrast"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("omits the help link when helpUrl is empty", () => {
    render(<ViolationCard violation={violation({ helpUrl: "" })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
