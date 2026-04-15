export const copy = {
  brand: {
    name: "Euthus",
    tagline: "Acessibilidade, vista com clareza.",
    taglineAlt: "A auditoria que explica, não só aponta.",
  },
  nav: {
    dashboard: "Painel",
    learn: "Aprender",
    toggleTheme: "Alternar tema",
    skipToContent: "Pular para o conteúdo",
  },
  landing: {
    heroLead:
      "O Euthus audita sites como um usuário real, encontra barreiras de acessibilidade e explica o impacto humano de cada uma.",
    ctaPrimary: "Auditar um site",
    ctaSecondary: "Ver relatório de exemplo",
    manifestoTitle: "Por que acessibilidade importa",
    manifestoBody:
      "1 em cada 6 pessoas no mundo vive com alguma deficiência. Um site inacessível não é um detalhe técnico: é uma porta fechada.",
    howItWorksTitle: "Como funciona",
    steps: [
      { n: "01", title: "Você envia uma URL", body: "Qualquer página pública." },
      { n: "02", title: "Euthus navega como um usuário real", body: "Com um navegador completo, executa axe-core e captura evidência visual." },
      { n: "03", title: "Você recebe um relatório", body: "Barreiras agrupadas por severidade, com impacto humano e como corrigir." },
    ],
    forWhoTitle: "Pra quem é",
    audiences: [
      { title: "Devs", body: "Integre acessibilidade no ciclo de desenvolvimento." },
      { title: "Designers", body: "Valide decisões antes que virem código." },
      { title: "Product", body: "Entenda o impacto humano das suas escolhas." },
      { title: "Compliance", body: "Documente conformidade com WCAG 2.1 AA." },
    ],
  },
  dashboard: {
    title: "Suas auditorias",
    lead: "Envie uma URL e receba um relatório completo em cerca de 30 segundos.",
    submitPlaceholder: "https://exemplo.com",
    submitButton: "Auditar",
    submitHint: "Leva ~30s. Você pode fechar a aba — o relatório fica salvo.",
    empty: "Nenhuma auditoria ainda. Envie uma URL acima pra começar.",
    tableUrl: "URL",
    tableStatus: "Status",
    tableScore: "Score",
    tableDate: "Data",
    statusQueued: "Na fila",
    statusProcessing: "Processando",
    statusDone: "Concluído",
    statusFailed: "Falhou",
  },
  report: {
    scoreLabel: "Pontuação Euthus",
    reauditButton: "Re-auditar",
    exportPdf: "Exportar PDF",
    exportJson: "Exportar JSON",
    exportSoon: "Em breve",
    violationsTitle: "Barreiras encontradas",
    emptyViolations: "Nenhuma barreira detectada nesta página.",
    howToFix: "Como corrigir",
    affectedNodes: (n: number) => `${n} ${n === 1 ? "elemento afetado" : "elementos afetados"}`,
    barriersSummary: (total: number, critical: number) =>
      critical > 0
        ? `${total} barreiras encontradas. ${critical} delas podem impedir completamente o uso por leitores de tela.`
        : `${total} barreiras encontradas.`,
  },
  severity: {
    critical: {
      label: "Crítica",
      humanImpact: "Pode impedir completamente o uso por tecnologias assistivas.",
    },
    serious: {
      label: "Séria",
      humanImpact: "Dificulta significativamente a navegação.",
    },
    moderate: {
      label: "Moderada",
      humanImpact: "Causa confusão ou esforço extra pro usuário.",
    },
    minor: {
      label: "Leve",
      humanImpact: "Impacto pequeno, mas ainda assim uma barreira.",
    },
  },
  footer: {
    builtWith: "Construído com axe-core. Código aberto.",
    links: {
      github: "GitHub",
      apiDocs: "API",
      learn: "Aprender",
    },
  },
} as const;

export type Copy = typeof copy;
