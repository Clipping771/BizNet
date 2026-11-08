"use client";

import Link from "next/link";
import { BowlFood, Coffee, ForkKnife, Package, Scroll, ShoppingBag, Stack, ToiletPaper, type Icon } from "@phosphor-icons/react";
import { useT } from "@/components/ui/T";

/** Each packaging category's icon and tint. Unknown categories get the neutral one. */
const VISUALS: Record<string, { icon: Icon; tile: string }> = {
  containers: { icon: BowlFood, tile: "bg-sky-50 text-sky-700" },
  food_boxes: { icon: Package, tile: "bg-amber-50 text-amber-700" },
  carry_bags: { icon: ShoppingBag, tile: "bg-emerald-50 text-emerald-700" },
  cups: { icon: Coffee, tile: "bg-rose-50 text-rose-700" },
  tissue: { icon: ToiletPaper, tile: "bg-violet-50 text-violet-700" },
  cutlery: { icon: ForkKnife, tile: "bg-orange-50 text-orange-700" },
  foil_wrap: { icon: Scroll, tile: "bg-teal-50 text-teal-700" },
};
const NEUTRAL = { icon: Stack, tile: "bg-primary-50 text-primary-700" };

export function CategoryVisual({ slug, size = 28, className = "" }: { slug?: string | null; size?: number; className?: string }) {
  const { icon: CategoryIcon, tile } = (slug && VISUALS[slug]) || NEUTRAL;
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${tile} ${className}`}>
      <CategoryIcon size={size} weight="duotone" />
    </span>
  );
}

/** Tiles that open search on a category. */
export function CategoryGrid({ slugs }: { slugs: string[] }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {slugs.map((slug) => (
        <li key={slug}>
          <Link href={`/search?category=${slug}`} className="card card-link flex h-full items-center gap-3 p-3">
            <CategoryVisual slug={slug} size={22} className="h-10 w-10 rounded-lg" />
            <span className="min-w-0 text-sm font-medium leading-snug text-slate-800">{t(`category.${slug}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
