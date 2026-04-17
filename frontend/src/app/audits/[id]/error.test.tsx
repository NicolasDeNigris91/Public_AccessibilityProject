import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditDetailError from "./error";
import { copy } from "@/lib/copy";

describe("AuditDetailError (Next.js error boundary)", () => {
  // Silence the expected console.error from useEffect within the component.
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  afterAll(() => errSpy.mockRestore());

  it("renders the crash heading and hint", () => {
    render(<AuditDetailError error={new Error("boom")} reset={jest.fn()} />);
    expect(
      screen.getByRole("heading", { name: copy.report.states.crash })
    ).toBeInTheDocument();
    expect(
      screen.getByText(copy.report.states.crashHint)
    ).toBeInTheDocument();
  });

  it("calls reset when the retry button is clicked", async () => {
    const reset = jest.fn();
    const user = userEvent.setup();
    render(<AuditDetailError error={new Error("boom")} reset={reset} />);

    await user.click(
      screen.getByRole("button", { name: copy.report.states.retry })
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("logs the error to the console so it reaches ops tooling", () => {
    const err = new Error("render blew up");
    render(<AuditDetailError error={err} reset={jest.fn()} />);
    expect(errSpy).toHaveBeenCalledWith("audit detail page crashed", err);
  });
});
