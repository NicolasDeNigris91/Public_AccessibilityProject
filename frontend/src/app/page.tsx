import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { copy } from "@/lib/copy";

export default function LandingPage() {
  return (
    <>
      <section className="pt-24 pb-20">
        <Container className="flex flex-col gap-10">
          <div className="max-w-3xl">
            <h1 className="font-serif text-display text-ink">
              {copy.brand.tagline}
            </h1>
            <p className="mt-6 max-w-prose text-lg text-ink/80">
              {copy.landing.heroLead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app">
                <Button size="lg">{copy.landing.ctaPrimary}</Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Section tone="muted">
        <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
          <h2 className="font-serif text-3xl text-ink md:text-4xl">
            {copy.landing.manifestoTitle}
          </h2>
          <p className="max-w-prose text-lg text-ink/85">
            {copy.landing.manifestoBody}
          </p>
        </div>
      </Section>

      <Section>
        <h2 className="mb-12 font-serif text-3xl text-ink md:text-4xl">
          {copy.landing.howItWorksTitle}
        </h2>
        <ol className="grid gap-8 md:grid-cols-3">
          {copy.landing.steps.map((step) => (
            <li key={step.n} className="flex flex-col gap-3 border-t border-line/60 pt-5">
              <span className="font-mono text-sm text-brand">{step.n}</span>
              <h3 className="font-serif text-2xl text-ink">{step.title}</h3>
              <p className="text-ink/80">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="muted">
        <h2 className="mb-12 font-serif text-3xl text-ink md:text-4xl">
          {copy.landing.forWhoTitle}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {copy.landing.audiences.map((a) => (
            <div
              key={a.title}
              className="flex flex-col gap-2 rounded border border-line/60 bg-surface p-6"
            >
              <h3 className="font-serif text-xl text-ink">{a.title}</h3>
              <p className="text-sm text-ink/80">{a.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
