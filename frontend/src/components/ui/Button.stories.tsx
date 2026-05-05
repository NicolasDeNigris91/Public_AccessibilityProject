import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: { type: "inline-radio" },
      options: ["primary", "secondary", "ghost", "link"],
    },
    size: {
      control: { type: "inline-radio" },
      options: ["sm", "md", "lg"],
    },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Auditar um site",
    variant: "primary",
    size: "md",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Re-auditar" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Exportar PDF" },
};

export const Link: Story = {
  args: { variant: "link", children: "Como corrigir" },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <Button {...args} size="sm">
        Pequeno
      </Button>
      <Button {...args} size="md">
        Médio
      </Button>
      <Button {...args} size="lg">
        Grande
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, children: "Em breve", variant: "ghost" },
};
