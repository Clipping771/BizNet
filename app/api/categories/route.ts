import { NextResponse } from "next/server";
import { listActiveCategories } from "@/lib/repo/category";

export async function GET() {
  try {
    const categories = await listActiveCategories();
    return NextResponse.json(categories);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}
