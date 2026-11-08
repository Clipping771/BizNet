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
  Storefront,
  SealCheck,
  ClipboardText,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: PhosphorIcon;
}

export interface NavSection {
  titleKey?: string;
  items: NavItem[];
}

/** Phone tab bar: the daily destinations around a centre "new request" button; "More" opens the rest.
 *  Messages sit in the top bar on phones. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: House },
  { href: "/requests", labelKey: "nav.requests", icon: FileText },
  { href: "/orders", labelKey: "orders.title", icon: Package },
];

/** Pages the phone tab bar has no room for; the account menu lists them on phones. */
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

/** Desktop sidebar: what a user sees depends on what their active business does. */
export function navSections(opts: { isSupplier: boolean; isAdmin: boolean; hasBusiness: boolean; creditsEnabled: boolean }): NavSection[] {
  const sections: NavSection[] = [
    {
      items: [
        { href: "/home", labelKey: "nav.home", icon: House },
        { href: "/requests", labelKey: "nav.requests", icon: FileText },
        { href: "/orders", labelKey: "orders.title", icon: Package },
        { href: "/inbox", labelKey: "nav.inbox", icon: Tray },
      ],
    },
    {
      titleKey: "nav.section.market",
      items: [
        { href: "/search", labelKey: "nav.search", icon: MagnifyingGlass },
        { href: "/prices", labelKey: "nav.prices", icon: ChartLineUp },
        { href: "/q", labelKey: "nav.discuss", icon: ChatsCircle },
      ],
    },
  ];
  if (opts.isSupplier) {
    sections.push({
      titleKey: "nav.section.selling",
      items: [
        { href: "/requests/inbox", labelKey: "nav.requestsToQuote", icon: ClipboardText },
        { href: "/quotes", labelKey: "quotes.title", icon: Receipt },
        { href: "/business/listings", labelKey: "nav.listings", icon: Storefront },
      ],
    });
  }
  if (opts.hasBusiness) {
    sections.push({
      titleKey: "nav.section.business",
      items: [
        { href: "/business/settings", labelKey: "business.settingsTitle", icon: Buildings },
        { href: "/business/members", labelKey: "business.membersTitle", icon: UsersThree },
        ...(opts.isSupplier ? [{ href: "/business/verification", labelKey: "nav.verification", icon: SealCheck }] : []),
        ...(opts.isSupplier && opts.creditsEnabled ? [{ href: "/business/credits", labelKey: "credits.title", icon: Coins }] : []),
      ],
    });
  }
  if (opts.isAdmin) {
    sections.push({ titleKey: "nav.section.admin", items: [ADMIN_NAV] });
  }
  return sections;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Routes that render without the app chrome (landing, sign-in, onboarding, legal pages). */
export function isBareRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/onboarding") ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/community-rules"
  );
}
