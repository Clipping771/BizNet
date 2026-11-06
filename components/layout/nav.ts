import {
  House,
  FileText,
  MagnifyingGlass,
  ChatsCircle,
  Tray,
  Package,
  Receipt,
  ChartLineUp,
  Bell,
  Buildings,
  UsersThree,
  Coins,
  Translate,
  SquaresFour,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: PhosphorIcon;
}

/** The five destinations on the phone tab bar; the sidebar repeats them first. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: House },
  { href: "/requests", labelKey: "nav.requests", icon: FileText },
  { href: "/search", labelKey: "nav.search", icon: MagnifyingGlass },
  { href: "/q", labelKey: "nav.discuss", icon: ChatsCircle },
  { href: "/inbox", labelKey: "nav.inbox", icon: Tray },
];

/** Desktop top bar tabs (the bell is added separately so it can carry the unread badge). */
export const TOP_NAV: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: House },
  { href: "/requests", labelKey: "nav.requests", icon: FileText },
  { href: "/orders", labelKey: "orders.title", icon: Package },
  { href: "/q", labelKey: "nav.discuss", icon: ChatsCircle },
  { href: "/inbox", labelKey: "nav.inbox", icon: Tray },
];

export const TRADE_NAV: NavItem[] = [
  { href: "/orders", labelKey: "orders.title", icon: Package },
  { href: "/quotes", labelKey: "quotes.title", icon: Receipt },
  { href: "/prices", labelKey: "nav.prices", icon: ChartLineUp },
  { href: "/notifications", labelKey: "notifications.title", icon: Bell },
];

export const BUSINESS_NAV: NavItem[] = [
  { href: "/business/settings", labelKey: "business.settingsTitle", icon: Buildings },
  { href: "/business/members", labelKey: "business.membersTitle", icon: UsersThree },
  { href: "/business/credits", labelKey: "credits.title", icon: Coins },
  { href: "/account/language", labelKey: "common.language", icon: Translate },
];

export const ADMIN_NAV: NavItem = { href: "/admin", labelKey: "admin.nav.dashboard", icon: SquaresFour };

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that render without the app chrome (landing, sign-in, onboarding). */
export function isBareRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/onboarding");
}
