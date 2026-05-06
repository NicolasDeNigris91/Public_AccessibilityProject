import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInForm } from "./SignInForm";

jest.mock("@/lib/auth", () => ({
  requestMagicLink: jest.fn(),
}));
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { requestMagicLink } from "@/lib/auth";
const requestMock = requestMagicLink as jest.MockedFunction<typeof requestMagicLink>;

describe("SignInForm", () => {
  beforeEach(() => {
    push.mockReset();
    requestMock.mockReset().mockResolvedValue(undefined);
  });

  it("requires an email before posting", async () => {
    render(<SignInForm />);
    const submit = screen.getByRole("button", { name: /enviar/i });
    // Empty value → submit button is disabled, so no API call.
    expect(submit).toBeDisabled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("submits the entered email and routes to /entrar/check on success", async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith("a@b.com");
      expect(push).toHaveBeenCalledWith("/entrar/check");
    });
  });

  it("maps invalid_email error from the backend to the localized field error", async () => {
    // Use a syntactically-valid email so jsdom's intrinsic form validation
    // doesn't block the submit before our onSubmit handler runs. The error
    // mapping is what we're exercising here, not the browser's validity.
    requestMock.mockRejectedValueOnce(new Error("invalid_email"));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/email inválido/i));
    expect(push).not.toHaveBeenCalled();
  });

  it("maps the 503 'auth/email-not-configured' error to the friendly copy", async () => {
    requestMock.mockRejectedValueOnce(new Error("auth/email-not-configured"));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/não está configurado pra enviar emails/i)
    );
  });

  it("maps rate-limited errors to the cool-down copy", async () => {
    requestMock.mockRejectedValueOnce(new Error("rate_limited_per_ip_email"));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/muitos pedidos/i));
  });

  it("falls back to a generic message for any unmapped error", async () => {
    requestMock.mockRejectedValueOnce(new Error("http_502"));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/algo deu errado/i));
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolve: (() => void) | undefined;
    requestMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: "a@b.com" },
    });
    const submit = screen.getByRole("button", { name: /enviar/i });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    if (resolve) resolve();
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});
