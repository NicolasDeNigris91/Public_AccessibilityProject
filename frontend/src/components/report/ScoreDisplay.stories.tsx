import type { Meta, StoryObj } from "@storybook/react";
import { ScoreDisplay } from "./ScoreDisplay";

const meta = {
  title: "Report/ScoreDisplay",
  component: ScoreDisplay,
  argTypes: {
    score: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
  args: { score: 92 },
} satisfies Meta<typeof ScoreDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighScore: Story = { args: { score: 96 } };
export const ModerateScore: Story = { args: { score: 78 } };
export const LowScore: Story = { args: { score: 42 } };

export const AllRanges: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-8">
      <ScoreDisplay score={96} />
      <ScoreDisplay score={78} />
      <ScoreDisplay score={42} />
    </div>
  ),
};
