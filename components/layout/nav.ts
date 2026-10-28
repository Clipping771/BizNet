import {
  Home,
  FileText,
  Search,
  MessagesSquare,
  Inbox,
  Package,
  ReceiptText,
  TrendingUp,
  Bell,
  Building2,
  Users,
  Coins,
  Languages,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

/** The five destinations on the phone tab bar; the sidebar repeats them first. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: Home },
  { href: "/requests", labelKey: "nav.requests", icon: FileText },
  { href: "/search", labelKey: "nav.search", icon: Search },
  { href: "/q", labelKey: "nav.discuss", icon: MessagesSquare },
  { href: "/inbox", labelKey: "nav.inbox", icon: Inbox },
];

export const TRADE_NAV: NavItem[] = [
  { href: "/orders", labelKey: "orders.title", icon: Package },
  { href: "/quotes", labelKey: "quotes.title", icon: ReceiptText },
  { href: "/prices", labelKey: "nav.prices", icon: TrendingUp },
  { href: "/notifications", labelKey: "notifications.title", icon: Bell },
];

export const BUSINESS_NAV: NavItem[] = [
  { href: "/business/settings", labelKey: "business.settingsTitle", icon: Building2 },
  { href: "/business/members", labelKey: "business.membersTitle", icon: Users },
  { href: "/business/credits", labelKey: "credits.title", icon: Coins },
  { href: "/account/language", labelKey: "common.language", icon: Languages },
];

export const ADMIN_NAV: NavItem = { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard };

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that render without the app chrome (landing, sign-in, onboarding). */
export function isBareRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/onboarding");
}
