import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportHeader } from "./ReportHeader";
import { copy } from "@/lib/copy";

describe("ReportHeader", () => {
  const url = "https://example.com";
  const score = 87;

  it("renders the URL as a link opening in a new tab with safe rel", () => {
    render(<ReportHeader url={url} score={score} />);
    const link = screen.getByRole("link", { name: url });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders the formatted pt-BR date when createdAt is provided", () => {
    render(
      <ReportHeader
        url={url}
        score={score}
        createdAt="2026-04-17T10:00:00.000Z"
      />
    );
    expect(screen.getByText(/17 de abril de 2026/i)).toBeInTheDocument();
  });

  it("omits the date when createdAt is missing", () => {
    const { container } = render(<ReportHeader url={url} score={score} />);
    expect(container.textContent).not.toMatch(/de \d{4}/);
  });

  it("shows the re-audit button and fires the callback when clicked", async () => {
    const onReaudit = jest.fn();
    const user = userEvent.setup();
    render(<ReportHeader url={url} score={score} onReaudit={onReaudit} />);

    await user.click(
      screen.getByRole("button", { name: copy.report.reauditButton })
    );
    expect(onReaudit).toHaveBeenCalledTimes(1);
  });

  it("hides the re-audit button when onReaudit is not provided", () => {
    render(<ReportHeader url={url} score={score} />);
    expect(
      screen.queryByRole("button", { name: copy.report.reauditButton })
    ).toBeNull();
  });

  it("renders the PDF and JSON export placeholders as disabled", () => {
    render(<ReportHeader url={url} score={score} />);
    const pdfBtn = screen.getByRole("button", { name: copy.report.exportPdf });
    const jsonBtn = screen.getByRole("button", { name: copy.report.exportJson });
    expect(pdfBtn).toBeDisabled();
    expect(jsonBtn).toBeDisabled();
  });
});
