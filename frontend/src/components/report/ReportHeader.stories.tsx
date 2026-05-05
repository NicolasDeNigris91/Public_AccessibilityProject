import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { ReportHeader } from "./ReportHeader";

const meta = {
  title: "Report/ReportHeader",
  component: ReportHeader,
  args: {
    url: "https://www.example.com/produto/perfil",
    score: 84,
    createdAt: "2026-04-30T14:20:00.000Z",
    onReaudit: fn(),
  },
} satisfies Meta<typeof ReportHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HighScore: Story = {
  args: { score: 97, url: "https://www.example.com/landing" },
};

export const LowScore: Story = {
  args: { score: 38, url: "https://www.example.com/checkout" },
};

export const WithoutDate: Story = {
  render: () => (
    <ReportHeader url="https://www.example.com/produto/perfil" score={84} onReaudit={fn()} />
  ),
};

export const WithoutReauditAction: Story = {
  render: () => (
    <ReportHeader
      url="https://www.example.com/produto/perfil"
      score={84}
      createdAt="2026-04-30T14:20:00.000Z"
    />
  ),
};

export const LongUrl: Story = {
  args: {
    url: "https://www.example.com/uma/url/bem/comprida/que/precisa/quebrar/em/varias/linhas?query=true",
  },
};
