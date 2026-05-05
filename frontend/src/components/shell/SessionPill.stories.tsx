import type { Meta, StoryObj } from "@storybook/react";
import { SessionPillView } from "./SessionPill";

const meta = {
  title: "Shell/SessionPill",
  component: SessionPillView,
  parameters: {
    docs: {
      description: {
        component:
          "Header pill that surfaces the auth state. Stories drive the presentational view directly so each variant renders without a backend.",
      },
    },
  },
  argTypes: {
    onSignOut: { action: "sign-out" },
  },
} satisfies Meta<typeof SessionPillView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  args: { user: null, isLoading: false },
};

export const Loading: Story = {
  args: { user: null, isLoading: true },
};

export const SignedInShortEmail: Story = {
  args: {
    user: { id: "u1", email: "ana@euthus.dev" },
    isLoading: false,
  },
};

export const SignedInLongEmail: Story = {
  args: {
    user: {
      id: "u1",
      email: "ana.gabriela.de.almeida.silva@uma-empresa-com-dominio-comprido.example",
    },
    isLoading: false,
  },
};

export const SigningOut: Story = {
  args: {
    user: { id: "u1", email: "ana@euthus.dev" },
    isLoading: false,
    signingOut: true,
  },
};
