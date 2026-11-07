import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a test build run next to a developer's `next dev` without sharing .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // Ship only the icons a page uses, not the whole icon set
  experimental: { optimizePackageImports: ["@phosphor-icons/react", "lucide-react"] },
  serverExternalPackages: ["iron-session", "iron-webcrypto"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default withNextIntl(nextConfig);

