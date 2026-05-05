import type { Meta, StoryObj } from "@storybook/react";
import { ViolationCard } from "./ViolationCard";
import type { Violation } from "@/lib/types";

const baseViolation: Violation = {
  id: "color-contrast",
  impact: "serious",
  description: "Elementos devem ter contraste suficiente entre texto e fundo",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
  tags: ["wcag2aa", "wcag143"],
  nodes: [
    { target: ["main > p.lead"], failureSummary: "Contraste medido 3.2:1, mínimo 4.5:1" },
    { target: ["footer a"], failureSummary: "Contraste medido 2.9:1, mínimo 4.5:1" },
  ],
};

const meta = {
  title: "Report/ViolationCard",
  component: ViolationCard,
} satisfies Meta<typeof ViolationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {
  args: {
    violation: {
      ...baseViolation,
      id: "image-alt",
      impact: "critical",
      description: "Imagens devem ter texto alternativo",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      nodes: [{ target: ["main img:nth-child(3)"] }],
    },
  },
};

export const Serious: Story = {
  args: { violation: baseViolation },
};

export const Moderate: Story = {
  args: {
    violation: {
      ...baseViolation,
      id: "landmark-one-main",
      impact: "moderate",
      description: "A página deve ter um único landmark main",
      nodes: [{ target: ["body"] }],
    },
  },
};

export const Minor: Story = {
  args: {
    violation: {
      ...baseViolation,
      id: "region",
      impact: "minor",
      description: "Todo conteúdo deve estar contido em landmarks",
      nodes: [{ target: ["body > div.misc"] }],
    },
  },
};

export const NoHelpLink: Story = {
  args: {
    violation: {
      ...baseViolation,
      helpUrl: "",
      description: "Regra interna sem link de referência externa",
    },
  },
};

export const ManyAffectedNodes: Story = {
  args: {
    violation: {
      ...baseViolation,
      nodes: Array.from({ length: 17 }, (_, i) => ({ target: [`#item-${i}`] })),
    },
  },
};
