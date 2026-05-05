import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionPill } from "./SessionPill";

jest.mock("@/lib/useSession", () => ({
  useSession: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({
  logout: jest.fn(),
}));

import { useSession } from "@/lib/useSession";
import { logout } from "@/lib/auth";

const useSessionMock = useSession as jest.MockedFunction<typeof useSession>;
const logoutMock = logout as jest.MockedFunction<typeof logout>;

describe("SessionPill", () => {
  beforeEach(() => {
    useSessionMock.mockReset();
    logoutMock.mockReset().mockResolvedValue(undefined);
  });

  it("renders an invisible placeholder while the session is loading", () => {
    useSessionMock.mockReturnValue({
      user: null,
      isLoading: true,
      refresh: jest.fn(),
    });
    const { container } = render(<SessionPill />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // Placeholder is aria-hidden so screen readers skip it.
    const placeholder = container.querySelector('[aria-hidden="true"]');
    expect(placeholder).not.toBeNull();
  });

  it("renders an Entrar link when no user is present", () => {
    useSessionMock.mockReturnValue({
      user: null,
      isLoading: false,
      refresh: jest.fn(),
    });
    render(<SessionPill />);
    const link = screen.getByRole("link", { name: /entrar/i });
    expect(link).toHaveAttribute("href", "/entrar");
  });

  it("renders the user's email and a Sair button when signed in", () => {
    useSessionMock.mockReturnValue({
      user: { id: "u1", email: "a@b.com" },
      isLoading: false,
      refresh: jest.fn(),
    });
    render(<SessionPill />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });

  it("calls logout and refresh on Sair click", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    useSessionMock.mockReturnValue({
      user: { id: "u1", email: "a@b.com" },
      isLoading: false,
      refresh,
    });
    render(<SessionPill />);
    fireEvent.click(screen.getByRole("button", { name: /sair/i }));
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the button while logout is in flight to prevent double-click", async () => {
    let resolveLogout: () => void = () => undefined;
    logoutMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      })
    );
    useSessionMock.mockReturnValue({
      user: { id: "u1", email: "a@b.com" },
      isLoading: false,
      refresh: jest.fn().mockResolvedValue(undefined),
    });
    render(<SessionPill />);
    const btn = screen.getByRole("button", { name: /sair/i });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    resolveLogout();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("truncates very long emails via the title/aria-label fallback", () => {
    const longEmail = "averylongemailthatprobablydoesnotexist@somewhere-very-very-far.example";
    useSessionMock.mockReturnValue({
      user: { id: "u1", email: longEmail },
      isLoading: false,
      refresh: jest.fn(),
    });
    render(<SessionPill />);
    const span = screen.getByText(longEmail);
    expect(span).toHaveAttribute("title", expect.stringContaining(longEmail));
    expect(span).toHaveAttribute("aria-label", expect.stringContaining(longEmail));
  });
});
