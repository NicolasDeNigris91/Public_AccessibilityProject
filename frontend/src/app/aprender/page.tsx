import { Container } from "@/components/ui/Container";
import { copy } from "@/lib/copy";

const sections = [
  {
    title: "O que é acessibilidade web",
    body: "Acessibilidade é construir a web para todas as pessoas, incluindo quem usa leitor de tela, navega só pelo teclado, tem baixa visão, daltonismo, ou dificuldades motoras e cognitivas. Um site acessível funciona com qualquer corpo e qualquer tecnologia.",
  },
  {
    title: "WCAG 2.1 em 4 princípios",
    body: "Perceptível (informação visível pra todos os sentidos), Operável (navegável por teclado), Compreensível (conteúdo previsível e claro) e Robusto (funciona em qualquer agente de usuário, incluindo assistivos).",
  },
  {
    title: "Como o Euthus audita",
    body: "Abrimos a página num navegador completo (Puppeteer), executamos axe-core pra identificar violações WCAG e calculamos um score ponderado por severidade. Cada violação inclui o seletor CSS, o HTML do nó afetado e um link pra documentação oficial.",
  },
  {
    title: "Severidades",
    body: "Crítica impede o uso por tecnologias assistivas; Séria dificulta muito; Moderada causa atrito; Leve tem impacto pequeno mas ainda é barreira. Priorize as críticas: elas fecham a porta inteira.",
  },
  {
    title: "Limitações de auditoria automática",
    body: "Axe-core detecta cerca de 30 a 40% dos problemas de acessibilidade. O restante exige teste humano com leitor de tela, navegação por teclado e revisão de conteúdo. Use o Euthus como linha de base, não como selo final.",
  },
];

export default function LearnPage() {
  return (
    <section className="py-20">
      <Container className="flex max-w-prose flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-wider text-muted">{copy.nav.learn}</span>
          <h1 className="font-serif text-4xl text-ink md:text-5xl">
            Acessibilidade em poucas palavras
          </h1>
        </header>

        <div className="flex flex-col gap-10">
          {sections.map((s) => (
            <article key={s.title} className="flex flex-col gap-3 border-t border-line/60 pt-8">
              <h2 className="font-serif text-2xl text-ink">{s.title}</h2>
              <p className="text-lg text-ink/85">{s.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
