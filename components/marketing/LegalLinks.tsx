import Link from "next/link";
import { T } from "@/components/ui/T";

const LINKS = [
  { href: "/terms", k: "legal.terms.title" },
  { href: "/privacy", k: "legal.privacy.title" },
  { href: "/community-rules", k: "legal.community.title" },
];

/** Footer links to the three public policy pages (§7). */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {LINKS.map(({ href, k }) => (
        <Link key={href} href={href} className={`transition-colors ${className}`}>
          <T k={k} />
        </Link>
      ))}
    </nav>
  );
}
