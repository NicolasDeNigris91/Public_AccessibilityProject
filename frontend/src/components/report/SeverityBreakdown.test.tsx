import { render, screen } from "@testing-library/react";
import { SeverityBreakdown } from "./SeverityBreakdown";
import { copy } from "@/lib/copy";
import type { SeverityTotals } from "@/lib/types";

const totals = (overrides: Partial<SeverityTotals> = {}): SeverityTotals => ({
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  ...overrides,
});

describe("SeverityBreakdown", () => {
  it("renders all four severity labels in fixed order", () => {
    const { container } = render(<SeverityBreakdown totals={totals()} />);
    const terms = Array.from(container.querySelectorAll("dt")).map(
      (dt) => dt.textContent
    );
    expect(terms).toEqual([
      copy.severity.critical.label,
      copy.severity.serious.label,
      copy.severity.moderate.label,
      copy.severity.minor.label,
    ]);
  });

  it("shows the count for each severity", () => {
    render(
      <SeverityBreakdown
        totals={totals({ critical: 3, serious: 7, moderate: 1, minor: 12 })}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("uses a description list for screen readers", () => {
    const { container } = render(<SeverityBreakdown totals={totals()} />);
    expect(container.querySelector("dl")).not.toBeNull();
    expect(container.querySelectorAll("dt")).toHaveLength(4);
    expect(container.querySelectorAll("dd")).toHaveLength(4);
  });
});
