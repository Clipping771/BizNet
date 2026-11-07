import { NextRequest, NextResponse } from "next/server";
import { marketInsight } from "@/lib/ai/helpers";
import { latestSnapshots } from "@/lib/repo/pricing";

/** GET /api/prices — publishable groups of the latest nightly run (public, §7). */
export async function GET(req: NextRequest) {
  try {
    const rows = await latestSnapshots();
    const lang = req.cookies.get("biznet_lang")?.value === "bn" ? "bn" : "en";
    const insight = rows.length
      ? await marketInsight({ lang, groups: rows.map((r) => `${r.category.slug}: ${JSON.stringify(r.specLabel)}, delivery ${r.deliveryIncluded ? "included" : "separate"}, area ${r.area ?? "any"}`) }).catch(() => null)
      : null;
    return NextResponse.json({
      insight: insight?.ok ? insight.data.summary : null,
      groups: rows.map((r) => ({
        id: r.id,
        categorySlug: r.category.slug,
        specLabel: r.specLabel,
        unit: r.unit,
        currency: r.currency,
        quantityBand: r.quantityBand,
        deliveryIncluded: r.deliveryIncluded,
        area: r.area,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        p25: r.p25.toString(),
        median: r.median.toString(),
        p75: r.p75.toString(),
        sampleQuotes: r.sampleQuotes,
        sampleSuppliers: r.sampleSuppliers,
      })),
    });
  } catch (err) {
    console.error("Prices error:", err);
    return NextResponse.json({ error: "Failed to load prices" }, { status: 500 });
  }
}
