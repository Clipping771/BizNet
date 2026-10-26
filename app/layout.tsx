import "./globals.css";
import { getTranslations } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { TranslationsProvider } from "@/components/ui/T";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/repo/user";
import { findBusinessById } from "@/lib/repo/business";
import { cookies } from "next/headers";

export const metadata = {
  title: "BizNet — B2B Packaging & Disposables",
  description: "B2B platform connecting buyers, restaurants, and businesses with verified packaging suppliers",
};

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

  // Server-side guard (§16): Arabic ("ar") preview is strictly restricted to ADMIN
  if (lang === "ar") {
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

    if (!isAdmin) {
      lang = "en"; // Strictly block Arabic preview for non-admins
    }
  }

  const dir = lang === "ar" ? "rtl" : "ltr";
  const translations = await getTranslations(lang);

  return (
    <html lang={lang} dir={dir}>
      <body className="bg-gray-100 min-h-screen">
        <TranslationsProvider lang={lang} messages={translations}>
        <div className="app-container shadow-sm pb-20">
          <Header
            translations={translations}
            activeBusinessName={activeBusinessName}
            userPhone={userPhone}
            lang={lang}
          />
          <main className="flex-1 p-4">{children}</main>
          <BottomNav translations={translations} />
        </div>
        </TranslationsProvider>
      </body>
    </html>
  );
}
