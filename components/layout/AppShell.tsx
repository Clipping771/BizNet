"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
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
 * Signed-in app pages get the sidebar (desktop) or tab bar (phone); the landing page,
 * sign-in and onboarding render on their own.
 */
export function AppShell({ activeBusinessName, userPhone, lang, isLoggedIn, isAdmin, children }: AppShellProps) {
  const pathname = usePathname();
  const bare = isBareRoute(pathname);
  const effectiveLoggedIn = isLoggedIn || !bare;
  const chrome = effectiveLoggedIn && !bare;

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-surface-canvas">
      <Header
        activeBusinessName={activeBusinessName}
        userPhone={userPhone}
        lang={lang}
        isLoggedIn={effectiveLoggedIn}
        isAdmin={isAdmin}
        withSidebar={chrome}
      />
      {chrome && <Sidebar activeBusinessName={activeBusinessName} userPhone={userPhone} isAdmin={isAdmin} />}
      <main className={`px-4 pt-3 sm:px-6 lg:pe-8 lg:pt-4 ${chrome ? "pb-28 lg:ps-[17rem] lg:pb-12" : "pb-12 lg:px-8"}`}>{children}</main>
      {chrome && pathname === "/requests" && <Fab />}
      {chrome && <BottomNav />}
    </div>
  );
}
