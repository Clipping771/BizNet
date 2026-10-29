import "./globals.css";
import { Inter, Hind_Siliguri } from "next/font/google";
import { getTranslations } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { TranslationsProvider } from "@/components/ui/T";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/repo/user";
import { findBusinessById } from "@/lib/repo/business";
import { getLanguage } from "@/lib/repo/languages";
import { cookies } from "next/headers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bn",
  display: "swap",
});

export const viewport = {
  themeColor: "#006A4E",
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "BizNet — B2B Packaging & Disposables",
  description: "B2B platform connecting buyers, restaurants, and businesses with verified packaging suppliers",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await getSession();

  let activeBusinessName: string | undefined = undefined;
  let userPhone: string | undefined = undefined;
  let userLang: string | undefined = undefined;
  let user: any = null;

  if (session.isLoggedIn && session.userId) {
    user = await findUserById(session.userId);
    if (user) {
      userPhone = user.phone || undefined;
      if (session.activeBusinessId) {
        const biz = await findBusinessById(session.activeBusinessId);
        if (biz) {
          activeBusinessName = biz.name;
          userLang = biz.lang;
        }
      }
    }
  }

  // Language precedence: cookie > business lang > "en" (universal default)
  const langCookie = cookieStore.get("biznet_lang")?.value;
  let lang: string = langCookie || userLang || "en";

  // Only ACTIVE languages are served to everyone; DRAFT/BETA are an admin-only preview (§11).
  // Unknown codes fall back to English.
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const adminPhones = (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const isAdmin =
    session.role === "ADMIN" ||
    (userPhone && adminPhones.includes(userPhone)) ||
    (user?.email && adminEmails.includes(user.email.toLowerCase().trim())) ||
    user?.role === "ADMIN";

  let language = await getLanguage(lang).catch(() => null);
  const servable = language && (language.status === "ACTIVE" || (isAdmin && language.status !== "DISABLED"));
  if (!servable) {
    lang = "en";
    language = null;
  }

  const dir = language?.direction === "rtl" ? "rtl" : "ltr";
  const translations = await getTranslations(lang);

  return (
    <html lang={lang} dir={dir} className={`${inter.variable} ${hindSiliguri.variable}`}>
      <body className="min-h-screen font-sans">
        <TranslationsProvider lang={lang} messages={translations}>
          <AppShell
            activeBusinessName={activeBusinessName}
            userPhone={userPhone}
            lang={lang}
            isLoggedIn={!!user}
            isAdmin={!!isAdmin}
          >
            {children}
          </AppShell>
        </TranslationsProvider>
      </body>
    </html>
  );
}
