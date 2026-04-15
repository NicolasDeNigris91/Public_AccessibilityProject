/**
 * @jest-environment jsdom
 */
import { resolveInitialTheme, applyTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("returns stored theme when present", () => {
    localStorage.setItem("euthus-theme", "dark");
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to light when no preference", () => {
    expect(resolveInitialTheme()).toBe("light");
  });

  it("applies theme to html element and persists", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("euthus-theme")).toBe("dark");
  });
});
