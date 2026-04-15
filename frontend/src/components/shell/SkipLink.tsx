import { copy } from "@/lib/copy";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand focus:px-4 focus:py-2 focus:text-white focus:rounded"
    >
      {copy.nav.skipToContent}
    </a>
  );
}
