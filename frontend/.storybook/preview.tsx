import type { Preview } from "@storybook/nextjs-vite";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "../src/app/globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: {
      options: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      },
    },
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#FAF7F2" },
        { name: "ink", value: "#1A1714" },
      ],
    },
    layout: "padded",
  },
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Light vs dark surface",
      defaultValue: "light",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === "dark" ? "dark" : "light";
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = theme;
      }
      const fontVars = `${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`;
      return (
        <div
          className={`${fontVars} min-h-[160px] bg-bg font-sans text-ink antialiased`}
          data-theme={theme}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
