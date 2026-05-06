import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { ColorBlindToggle } from "@/components/shell/ColorBlindToggle";
import { SessionPill } from "@/components/shell/SessionPill";
import { copy } from "@/lib/copy";

const navLinks = [
  { href: "/app", label: copy.nav.dashboard },
  { href: "/aprender", label: copy.nav.learn },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link
          href="/"
          aria-label={copy.brand.name}
          className="inline-flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Logo variant="lockup" size={26} />
        </Link>

        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-6 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-ink/80 transition-colors hover:text-ink focus:outline-none focus-visible:text-ink focus-visible:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <ColorBlindToggle />
          <ThemeToggle />
          <SessionPill />
        </div>
      </Container>
    </header>
  );
}
