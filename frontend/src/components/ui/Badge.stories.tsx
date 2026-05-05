import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  argTypes: {
    severity: {
      control: { type: "inline-radio" },
      options: ["critical", "serious", "moderate", "minor", "pass", undefined],
    },
  },
  args: {
    children: "Crítica",
    severity: "critical",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {
  args: { severity: "critical", children: "Crítica" },
};

export const Serious: Story = {
  args: { severity: "serious", children: "Séria" },
};

export const Moderate: Story = {
  args: { severity: "moderate", children: "Moderada" },
};

export const Minor: Story = {
  args: { severity: "minor", children: "Leve" },
};

export const Pass: Story = {
  args: { severity: "pass", children: "Aprovado" },
};

export const Neutral: Story = {
  render: () => <Badge>Em breve</Badge>,
};

export const AllSeverities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge severity="critical">Crítica</Badge>
      <Badge severity="serious">Séria</Badge>
      <Badge severity="moderate">Moderada</Badge>
      <Badge severity="minor">Leve</Badge>
      <Badge severity="pass">Aprovado</Badge>
    </div>
  ),
};
