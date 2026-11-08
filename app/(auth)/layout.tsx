import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { LegalLinks } from "@/components/marketing/LegalLinks";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";

/** Sign-in and onboarding: the product's promise on a navy panel, the form on white. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-900 p-12 text-white lg:flex">
        <div aria-hidden="true" className="bg-grid-inverted pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -end-32 h-96 w-96 rounded-full bg-sky-400/30 blur-[100px]" />
        <div className="relative flex items-center justify-between gap-4">
          <Brand href="/" inverted />
          <LanguageSwitcher inverted />
        </div>
        <div className="relative">
          <h1 className="max-w-md text-[34px] font-bold leading-[1.1] tracking-[-0.03em]">
            <T k="landing.heroTitle" />
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-primary-100">
            <T k="landing.heroSubtitle" />
          </p>
          <ul className="mt-10 max-w-md space-y-5">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-inset ring-white/20">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    <T k={title} />
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-primary-100/70">
                    <T k={body} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <LegalLinks className="relative text-primary-100/70 hover:text-white" />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8 lg:hidden">
          <Brand href="/" />
          <LanguageSwitcher />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </main>
        <footer className="px-4 py-5 lg:hidden">
          <LegalLinks className="text-slate-500 hover:text-slate-800" />
        </footer>
      </div>
    </div>
  );
}
