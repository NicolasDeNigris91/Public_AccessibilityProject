import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { copy } from "@/lib/copy";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: `${copy.auth.signinTitle} · ${copy.brand.name}`,
  description: copy.auth.signinLead,
};

export default function SignInPage() {
  return (
    <section className="py-16">
      <Container className="flex max-w-md flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl text-ink md:text-4xl">{copy.auth.signinTitle}</h1>
          <p className="text-ink/80">{copy.auth.signinLead}</p>
        </header>
        <SignInForm />
      </Container>
    </section>
  );
}
