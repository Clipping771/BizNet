"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Fab } from "./Fab";
import { isBareRoute } from "./nav";

interface AppShellProps {
  activeBusinessName?: string;
  activeBusinessId?: string;
  businesses: { id: string; name: string }[];
  isSupplier: boolean;
  creditsEnabled: boolean;
  userPhone?: string;
  lang: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  children: React.ReactNode;
}

/**
 * Signed-in pages: a fixed navy sidebar from md up, a tab bar on phones, and a utility bar on top.
 * Logged-out public pages get the utility bar only; the landing page, sign-in and onboarding render on their own.
 */
export function AppShell({ activeBusinessName, activeBusinessId, businesses, isSupplier, creditsEnabled, userPhone, lang, isLoggedIn, isAdmin, children }: AppShellProps) {
  const pathname = usePathname();
  const bare = isBareRoute(pathname);
  const chrome = isLoggedIn && !bare;

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-surface-canvas">
      {chrome && <Sidebar isSupplier={isSupplier} isAdmin={isAdmin} hasBusiness={!!activeBusinessName} creditsEnabled={creditsEnabled} />}
      <div className={chrome ? "md:ps-56" : ""}>
        <Header
          activeBusinessName={activeBusinessName}
          activeBusinessId={activeBusinessId}
          businesses={businesses}
          userPhone={userPhone}
          lang={lang}
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          withSidebar={chrome}
        />
        <main className={`mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6 ${chrome ? "pb-24 md:pb-12" : "pb-12"}`}>{children}</main>
      </div>
      {chrome && pathname === "/requests" && <Fab />}
      {chrome && <BottomNav />}
    </div>
  );
}
