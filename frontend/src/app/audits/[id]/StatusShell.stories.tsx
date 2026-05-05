import type { Meta, StoryObj } from "@storybook/react";
import { ReauditAlert, StatusShell } from "./StatusShell";
import { Button } from "@/components/ui/Button";

const meta = {
  title: "Report/StatusShell",
  component: StatusShell,
  args: {
    title: "Auditando a página",
    hint: "Costuma levar cerca de 30 segundos. Pode deixar a aba aberta.",
    url: "https://www.example.com/checkout",
  },
} satisfies Meta<typeof StatusShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {
  args: {
    title: "Aguardando na fila",
    hint: "Vamos começar em instantes.",
  },
};

export const Running: Story = {
  args: {
    title: "Auditando a página",
    hint: "Costuma levar cerca de 30 segundos.",
  },
};

export const Failed: Story = {
  args: {
    title: "A auditoria falhou",
    hint: "Algo deu errado ao processar esta URL.",
    action: <Button variant="primary">Tentar novamente</Button>,
  },
};

export const NotFound: Story = {
  render: () => (
    <StatusShell
      title="Relatório não encontrado"
      hint="Este link pode estar expirado ou incorreto."
      action={<Button variant="secondary">Nova auditoria</Button>}
    />
  ),
};

export const WithReauditAlert: Story = {
  args: {
    title: "Auditando a página",
    hint: "Re-auditando após sua solicitação.",
    alert: "Re-auditoria iniciada — atualizando em instantes.",
  },
};
