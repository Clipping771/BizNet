import { NextResponse } from "next/server";
import { latestSnapshots } from "@/lib/repo/pricing";

/** GET /api/prices — publishable groups of the latest nightly run (public, §7). */
export async function GET() {
  try {
    const rows = await latestSnapshots();
    return NextResponse.json({
      groups: rows.map((r) => ({
        id: r.id,
        categorySlug: r.category.slug,
        specLabel: r.specLabel,
        unit: r.unit,
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
