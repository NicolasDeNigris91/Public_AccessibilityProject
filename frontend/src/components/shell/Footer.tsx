import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { API_URL } from "@/lib/api";
import { copy } from "@/lib/copy";

const footerLinks = [
  { href: "https://github.com/NicolasDeNigris91/AccessibilityProject", label: copy.footer.links.github, external: true },
  { href: `${API_URL}/docs`, label: copy.footer.links.apiDocs, external: true },
  { href: "/aprender", label: copy.footer.links.learn, external: false },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line/60 bg-surface/40">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Logo variant="mark" size={22} />
          <div className="flex flex-col">
            <span className="font-serif text-base leading-none">{copy.brand.name}</span>
            <span className="mt-1 text-xs text-ink/60">{copy.footer.builtWith}</span>
          </div>
        </div>

        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {footerLinks.map((link) =>
              link.external ? (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-ink/70 hover:text-ink focus:outline-none focus-visible:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ) : (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-ink/70 hover:text-ink focus:outline-none focus-visible:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
