import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { LegalLinks } from "@/components/marketing/LegalLinks";

/** One policy page: a title and numbered sections, all from the translation catalog. */
export function LegalPage({ titleKey, sections }: { titleKey: string; sections: string[] }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Brand href="/" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="page-title">
          <T k={titleKey} />
        </h1>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <T k="legal.draftNotice" />
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((key) => (
            <section key={key}>
              <h2 className="section-title">
                <T k={`${key}.h`} />
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                <T k={`${key}.p`} />
              </p>
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <LegalLinks className="text-slate-500 hover:text-slate-800" />
        </div>
      </footer>
    </div>
  );
}
