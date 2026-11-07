import { describe, it, expect } from "vitest";
import { newRequestSms, quoteReceivedSms } from "@/lib/sms/messages";

const BANGLA = /[ঀ-৿]/;

describe("SMS language", () => {
  it("is English by default, for an unset language and for languages without SMS text", () => {
    for (const lang of ["en", undefined, null, "ar"]) {
      expect(newRequestSms(lang, "Boxes", "REQ-1", "https://app.example/")).toBe(
        "BizNet: New quote request \"Boxes\". Code: REQ-1. Send your quote: https://app.example/requests/REQ-1"
      );
      expect(quoteReceivedSms(lang, "Boxes", "$10.00")).not.toMatch(BANGLA);
    }
  });

  it("is Bangla only for someone who chose Bangla", () => {
    expect(newRequestSms("bn", "Boxes", "REQ-1", "https://app.example")).toMatch(BANGLA);
    expect(quoteReceivedSms("bn", "Boxes", "$10.00")).toMatch(BANGLA);
  });
});
