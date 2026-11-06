"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { Fab } from "./Fab";
import { isBareRoute } from "./nav";

interface AppShellProps {
  activeBusinessName?: string;
  userPhone?: string;
  lang: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  children: React.ReactNode;
}

/**
 * Signed-in app pages get the top bar (with navigation tabs on desktop) and the phone tab bar;
 * the landing page, sign-in and onboarding render on their own.
 */
export function AppShell({ activeBusinessName, userPhone, lang, isLoggedIn, isAdmin, children }: AppShellProps) {
  const pathname = usePathname();
  const bare = isBareRoute(pathname);
  const chrome = isLoggedIn && !bare;

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-surface-canvas">
      <Header
        activeBusinessName={activeBusinessName}
        userPhone={userPhone}
        lang={lang}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        withSidebar={chrome}
      />
      <main className={`mx-auto max-w-6xl px-4 pt-4 sm:px-8 lg:pt-6 ${chrome ? "pb-24 md:pb-12" : "pb-12"}`}>{children}</main>
      {chrome && pathname === "/requests" && <Fab />}
      {chrome && <BottomNav />}
    </div>
  );
}
