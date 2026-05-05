import type { Meta, StoryObj } from "@storybook/react";
import { SeverityBreakdown } from "./SeverityBreakdown";

const meta = {
  title: "Report/SeverityBreakdown",
  component: SeverityBreakdown,
} satisfies Meta<typeof SeverityBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {
  args: { totals: { critical: 2, serious: 5, moderate: 8, minor: 12 } },
};

export const Empty: Story = {
  args: { totals: { critical: 0, serious: 0, moderate: 0, minor: 0 } },
};

export const CriticalOnly: Story = {
  args: { totals: { critical: 4, serious: 0, moderate: 0, minor: 0 } },
};

export const Heavy: Story = {
  args: { totals: { critical: 7, serious: 14, moderate: 21, minor: 33 } },
};
