"use client";

import Link from "next/link";
import { Building2, Globe, LogOut, ChevronDown, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/money";

interface HeaderProps {
  translations: Record<string, string>;
  activeBusinessName?: string;
  userPhone?: string;
  lang?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
}

export function Header({
  translations,
  activeBusinessName,
  userPhone,
  lang = "bn",
  isLoggedIn = false,
  isAdmin = false,
}: HeaderProps) {
  // Logged-in users without a business (e.g. admins, new sign-ups) still get the account menu
  const menuLabel = activeBusinessName || userPhone || translations["nav.account"] || "অ্যাকাউন্ট";
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Unread notification badge, refreshed every minute while the app is open
  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () =>
      fetch("/api/notifications?count=1")
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d) => setUnread(d.unread || 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-[640px] mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <Link href="/home" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-lg">
            {translations["app.title"]?.charAt(0) || "ব"}
          </span>
          <span className="font-bold text-lg text-gray-900 tracking-tight">
            {translations["app.title"] || "বিজনেট"}
          </span>
        </Link>

        {/* Business & Account Actions */}
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <Link
              href="/notifications"
              id="header-notifications"
              aria-label={translations["notifications.open"] || "Notifications"}
              className="relative p-2 rounded-full hover:bg-gray-50"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              {unread > 0 && (
                <span id="header-unread" className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 99 ? `${formatNumber(99, lang)}+` : formatNumber(unread, lang)}
                </span>
              )}
            </Link>
          )}
          {isLoggedIn || activeBusinessName ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100"
              >
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span className="max-w-[120px] truncate">{menuLabel}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {menuOpen && (
                <div className="absolute end-0 mt-1.5 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1.5 z-50 text-xs">
                  <div className="px-3 py-1.5 border-b border-gray-100">
                    <p className="font-semibold text-gray-800 truncate">{menuLabel}</p>
                    <p className="text-gray-500">{userPhone}</p>
                  </div>
                  <Link
                    href="/account"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{translations["nav.account"] || "অ্যাকাউন্ট"}</span>
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>{translations["admin.nav.dashboard"] || "Admin"}</span>
                    </Link>
                  )}
                  {activeBusinessName && (
                  <>
                  <Link
                    href="/business/members"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{translations["business.membersTitle"] || "সদস্যবৃন্দ"}</span>
                  </Link>
                  <Link
                    href="/business/settings"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{translations["business.settingsTitle"] || "ব্যবসার সেটিংস"}</span>
                  </Link>
                  <Link
                    href="/business/credits"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{translations["credits.title"] || "লিড ক্রেডিট"}</span>
                  </Link>
                  </>
                  )}
                  <Link
                    href="/account/language"
                    className="flex items-center justify-between px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{translations["common.language"] || "ভাষা"}</span>
                    <span className="text-gray-400 uppercase">{lang}</span>
                  </Link>
                  <div className="border-t border-gray-100 mt-1"></div>
                  <Link
                    href="/api/auth/logout"
                    className="flex items-center gap-1.5 px-3 py-2 text-secondary hover:bg-red-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{translations["nav.logout"] || "লগআউট"}</span>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs font-semibold text-primary px-3 py-1.5 rounded-md hover:bg-primary-light"
            >
              <span>{translations["auth.login"] || "লগইন"}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
