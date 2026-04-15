import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders only the mark in 'mark' variant", () => {
    render(<Logo variant="mark" size={32} />);
    expect(screen.queryByText("Euthus")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /euthus/i })).toBeInTheDocument();
  });

  it("renders wordmark + mark in 'lockup' variant", () => {
    render(<Logo variant="lockup" />);
    expect(screen.getByText("Euthus")).toBeInTheDocument();
  });
});
