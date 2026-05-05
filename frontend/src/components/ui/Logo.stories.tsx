import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";

const meta = {
  title: "UI/Logo",
  component: Logo,
  argTypes: {
    variant: {
      control: { type: "inline-radio" },
      options: ["mark", "lockup", "stacked"],
    },
    size: { control: { type: "range", min: 16, max: 96, step: 2 } },
  },
  args: { variant: "lockup", size: 28 },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lockup: Story = { args: { variant: "lockup", size: 32 } };
export const Mark: Story = { args: { variant: "mark", size: 48 } };
export const Stacked: Story = { args: { variant: "stacked", size: 64 } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <Logo variant="lockup" size={20} />
      <Logo variant="lockup" size={28} />
      <Logo variant="lockup" size={40} />
      <Logo variant="lockup" size={56} />
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-10">
      <Logo variant="mark" size={48} />
      <Logo variant="lockup" size={32} />
      <Logo variant="stacked" size={48} />
    </div>
  ),
};
