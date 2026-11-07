import { describe, expect, it } from "vitest";
import { parseNeed } from "@/lib/instant/parse";

describe("parseNeed", () => {
  it("reads quantity and size from Banglish", () => {
    expect(parseNeed("500 ta 750ml container lagbe")).toEqual({ quantity: 500, terms: ["750", "container"], sizes: ["750"] });
  });

  it("reads Bangla digits and words", () => {
    const need = parseNeed("কাল ৫০০টা ৭৫০ মিলি কন্টেইনার লাগবে");
    expect(need.quantity).toBe(500);
    expect(need.terms).toEqual(["750", "কন্টেইনার"]);
  });

  it("reads English", () => {
    const need = parseNeed("I need 1,000 pcs paper cups with lid");
    expect(need.quantity).toBe(1000);
    expect(need.terms).toEqual(["paper", "cups", "lid"]);
  });

  it("does not take a bare number for a quantity", () => {
    expect(parseNeed("কাপ ২৫০")).toEqual({ quantity: null, terms: ["কাপ", "250"], sizes: ["250"] });
  });

  it("leaves nothing to search for when only filler is typed", () => {
    expect(parseNeed("lagbe please").terms).toEqual([]);
  });
});
