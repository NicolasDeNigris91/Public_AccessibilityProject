import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#B8532A",
          hover: "#9F4522",
          accent: "#E8A87C",
        },
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        line: "rgb(var(--color-border) / <alpha-value>)",
        severity: {
          critical: "#C73E3E",
          serious: "#D97706",
          moderate: "#CA8A04",
          minor: "#0891B2",
          pass: "#15803D",
        },
      },
      fontFamily: {
        serif: ["var(--font-instrument-serif)", "Iowan Old Style", "Georgia", "serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        display: ["clamp(3.5rem, 6vw, 5rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        score: ["clamp(6rem, 10vw, 8rem)", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        lg: "8px",
      },
      boxShadow: {
        xs: "0 1px 2px rgb(0 0 0 / 0.04)",
        sm: "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
      },
      maxWidth: {
        prose: "65ch",
      },
    },
  },
  plugins: [],
} satisfies Config;
