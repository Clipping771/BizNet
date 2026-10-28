"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
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
  const chrome = isLoggedIn && !bare;

  if (bare) return <>{children}</>;

  return (
    <div className={chrome ? "min-h-screen lg:ps-64" : "min-h-screen"}>
      {chrome && <Sidebar activeBusinessName={activeBusinessName} userPhone={userPhone} isAdmin={isAdmin} />}
      <Header
        activeBusinessName={activeBusinessName}
        userPhone={userPhone}
        lang={lang}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        withSidebar={chrome}
      />
      <main className={`px-4 py-5 sm:px-6 lg:px-8 lg:py-8 ${chrome ? "pb-28 lg:pb-12" : "pb-12"}`}>{children}</main>
      {chrome && <BottomNav />}
    </div>
  );
}
