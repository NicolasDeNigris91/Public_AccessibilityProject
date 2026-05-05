import type { Meta, StoryObj } from "@storybook/react";
import { ReauditAlert } from "./StatusShell";

const meta = {
  title: "Report/ReauditAlert",
  component: ReauditAlert,
  args: { message: "Re-auditoria iniciada — atualizando em instantes." },
} satisfies Meta<typeof ReauditAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ErrorState: Story = {
  args: { message: "Não conseguimos iniciar a re-auditoria. Tente novamente em alguns segundos." },
};

export const LongMessage: Story = {
  args: {
    message:
      "A re-auditoria foi rejeitada porque você tem muitas tarefas em andamento. Aguarde alguma terminar antes de tentar novamente — costuma levar até 30 segundos por execução.",
  },
};
