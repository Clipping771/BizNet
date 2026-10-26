"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Search, MessageSquare, Inbox } from "lucide-react";

interface BottomNavProps {
  translations: Record<string, string>;
}

export function BottomNav({ translations }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/home", label: translations["nav.home"] || "হোম", icon: Home },
    { href: "/requests", label: translations["nav.requests"] || "অনুরোধ", icon: FileText },
    { href: "/search", label: translations["nav.search"] || "অনুসন্ধান", icon: Search },
    { href: "/q", label: translations["nav.discuss"] || "আলোচনা", icon: MessageSquare },
    { href: "/inbox", label: translations["nav.inbox"] || "ইনবক্স", icon: Inbox },
  ];

  return (
    <nav className="fixed bottom-0 start-0 end-0 z-50 bg-white border-t border-gray-200">
      <div className="max-w-[640px] mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 text-xs transition-colors ${
                isActive ? "text-primary font-semibold" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
