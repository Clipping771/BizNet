import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { LegalLinks } from "@/components/marketing/LegalLinks";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";

/** Sign-in and onboarding: the product's promise on a navy panel, the form on white. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-primary-950 p-12 text-white lg:flex">
        <Brand href="/" inverted />
        <div>
          <h1 className="max-w-md text-[32px] font-semibold leading-tight tracking-tight">
            <T k="landing.heroTitle" />
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-primary-100/80">
            <T k="landing.heroSubtitle" />
          </p>
          <ul className="mt-10 max-w-md space-y-5">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-amber-300">
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
        <LegalLinks className="text-primary-100/60 hover:text-white" />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center px-4 sm:px-8 lg:hidden">
          <Brand href="/" />
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
