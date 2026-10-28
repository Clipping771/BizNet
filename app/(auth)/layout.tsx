import { T } from "@/components/ui/T";
import { Brand } from "@/components/layout/Brand";
import { VALUE_PROPS } from "@/components/marketing/ValueProps";

/** Sign-in and onboarding: one rounded card on a plain canvas, brand story beside the form from lg up. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas">
      <main className="flex flex-1 items-start justify-center px-0 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full max-w-[1040px] animate-fade-up bg-white px-6 pb-10 pt-8 sm:rounded-[28px] sm:p-10 lg:grid lg:grid-cols-2 lg:gap-12 lg:p-12">
          <div className="mb-8 lg:mb-0">
            <Brand href="/" />
            <h1 className="mt-8 hidden text-[32px] font-normal leading-tight tracking-[-0.01em] text-gray-900 lg:block">
              <T k="landing.heroTitle" />
            </h1>
            <ul className="mt-8 hidden space-y-5 lg:block">
              {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="icon-tile">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-medium text-gray-900">
                      <T k={title} />
                    </span>
                    <span className="block text-sm text-gray-600">
                      <T k={body} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:pt-16">{children}</div>
        </div>
      </main>
      <footer className="px-6 py-6 text-center text-xs text-gray-500">
        <T k="landing.footer" />
      </footer>
    </div>
  );
}
