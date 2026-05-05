import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: `${copy.auth.checkInboxTitle} · ${copy.brand.name}`,
  description: copy.auth.checkInboxLead,
};

export default function CheckInboxPage() {
  return (
    <section className="py-16">
      <Container className="flex max-w-md flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl text-ink md:text-4xl">{copy.auth.checkInboxTitle}</h1>
          <p className="text-ink/80">{copy.auth.checkInboxLead}</p>
        </header>
        <Link
          href="/entrar"
          className="inline-flex w-fit items-center text-sm text-brand underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copy.auth.checkInboxRetry}
        </Link>
      </Container>
    </section>
  );
}
