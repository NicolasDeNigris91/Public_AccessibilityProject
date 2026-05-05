import { render, screen } from "@testing-library/react";
import { ReauditAlert, StatusShell } from "./StatusShell";

describe("StatusShell", () => {
  it("renders the heading as h1 with the provided title", () => {
    render(<StatusShell title="Aguardando na fila" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Aguardando na fila");
  });

  it("wraps the heading + url + hint in a polite, atomic live region for status transitions", () => {
    render(
      <StatusShell title="Auditando a página" hint="Pode levar 30 s" url="https://example.com" />
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Auditando a página");
    expect(region).toHaveTextContent("Pode levar 30 s");
    expect(region).toHaveTextContent("https://example.com");
  });

  it("re-announces the new title when status transitions queued -> running (rerender keeps live region)", () => {
    const { rerender } = render(<StatusShell title="Aguardando na fila" hint="Vamos começar" />);
    expect(screen.getByRole("status")).toHaveTextContent("Aguardando na fila");

    rerender(<StatusShell title="Auditando a página" hint="Pode levar 30 s" />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Auditando a página");
    expect(region).not.toHaveTextContent("Aguardando na fila");
  });

  it("renders action node outside the live region (so a button label isn't re-announced)", () => {
    render(<StatusShell title="Falhou" action={<button type="button">Tentar de novo</button>} />);
    const region = screen.getByRole("status");
    const button = screen.getByRole("button", { name: "Tentar de novo" });
    expect(region).not.toContainElement(button);
  });

  it("renders alert when alert prop is set, with role='alert' for assertive announcement", () => {
    render(<StatusShell title="Falhou" alert="Sem conexão com o servidor." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sem conexão com o servidor.");
  });

  it("does not render alert when alert prop is null or undefined", () => {
    render(<StatusShell title="Aguardando" alert={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("focuses the heading via ref when provided", () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(<StatusShell title="Carregando" headingRef={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("H1");
    expect(ref.current?.tabIndex).toBe(-1);
  });
});

describe("ReauditAlert", () => {
  it("renders with role='alert' so assistive tech announces immediately", () => {
    render(<ReauditAlert message="Algo deu errado." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Algo deu errado.");
  });
});
