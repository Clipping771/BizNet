import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";

/** Sign-in and onboarding: form on the right, brand story on the left from lg up. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative">
          <Brand href="/" inverted />
        </div>
        <div className="relative max-w-md space-y-8">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            <T k="landing.heroTitle" />
          </h2>
          <ul className="space-y-5">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">
                    <T k={title} />
                  </span>
                  <span className="block text-sm text-white/70">
                    <T k={body} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">
          <T k="landing.footer" />
        </p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <div className="flex h-16 items-center px-5 sm:px-8 lg:hidden">
          <Brand href="/" />
        </div>
        <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:items-center sm:px-8 sm:py-8">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
