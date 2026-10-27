import { describe, it, expect } from "vitest";
import { detectContactBypass, normalizeDigits } from "@/lib/contact/detect";

describe("lib/contact/detect.ts - Contact Filter Engine (§8.12, F14/F15, I2)", () => {
  it("normalizes Bangla and Arabic-Indic digits to Latin digits", () => {
    expect(normalizeDigits("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("৭৫০ মিলি")).toBe("750 মিলি");
  });

  describe("Fixture List: >= 30 Contact Bypass Attempts (Must all be blocked)", () => {
    const bypassAttempts = [
      // 1-5: Standard BD mobile formats with separators
      "Call me at 01712-345678 for bulk discount",
      "আমার নাম্বার 01819 123456 ফোন দেন",
      "Call +8801912345678 immediately",
      "Phone: (017) 1234-5678",
      "Contact: 8801712345678",

      // 6-10: Spaced and punctuated digit tricks
      "Call me 0 1 7 1 2 3 4 5 6 7 8",
      "Call 0.1.7.1.2.3.4.5.6.7.8 now",
      "Dial 0-1-9-1-2-3-4-5-6-7-8",
      "Contact: 0_1_8_1_2_3_4_5_6_7_8",
      "Phone: 017 12 34 56 78",

      // 11-15: Bangla digit obfuscation
      "যোগাযোগ করুন ০১৭১২-৩৪৫৬৭৮",
      "আমার নাম্বার ০ ১ ৭ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮",
      "কল দেন: ০১৭ ১২৩৪ ৫৬৭৮",
      "ফোন নম্বর: +৮৮০১৭১২৩৪৫৬৭৮",
      "কল করুন: ০.১.৮.১.২.৩.৪.৫.৬.৭.৮",

      // 16-20: Arabic-Indic and mixed digit bypass
      "Call me ٠١٧١٢٣٤٥٦٧٨",
      "Phone ٠١٧-١٢٣٤-٥٦٧٨",
      "Dial 017123456789 (12 digit run)",
      "My telephone number is 02987654321",
      "Office direct line 03165432109",

      // 21-25: Direct emails and obfuscated emails
      "Email me at supplier@example.com for price list",
      "Contact: sales.dept@factory.com.bd",
      "Send details to supplier at gmail dot com",
      "Email: info [at] packagingbd [dot] com",
      "Reach me via owner(at)dhakabox.com",

      // 26-30: Social media, messaging links & chat handles
      "Chat with me on wa.me/8801712345678",
      "Message on t.me/dhakapackaging",
      "Ping me on m.me/bestboxesbd",
      "Facebook page: facebook.com/dhakapack",
      "Visit https://fb.com/boxsupplier",
      "Instagram: instagram.com/bdpackagings",
      "Telegram @dhakaboxes for wholesale deals",
      "WhatsApp me at 01712345678",
      "হোয়াটসঅ্যাপ করুন ০১৭১২৩৪৫৬৭৮",
      "ইমো তে নক দেন ০১৮১২৩৪৫৬৭৮",
    ];

    it(`blocks all ${bypassAttempts.length} bypass attempts`, () => {
      expect(bypassAttempts.length).toBeGreaterThanOrEqual(30);
      for (const attempt of bypassAttempts) {
        const result = detectContactBypass(attempt);
        expect(
          result.hasContact,
          `Expected attempt to be flagged as contact bypass: "${attempt}"`
        ).toBe(true);
      }
    });
  });

  describe("Fixture List: >= 30 Legitimate Messages (Must NOT be flagged)", () => {
    const legitimateMessages = [
      // 1-5: Quantities with units
      "আমাদের ৫০০ পিস কন্টেইনার লাগবে",
      "Need 1000 pcs of 750ml containers",
      "We can supply 5000 boxes by next week",
      "আমাদের ২০ কেজি প্লাস্টিক দানা প্রয়োজন",
      "Available quantity: 2500 pcs in stock",

      // 6-10: Pricing with currency and units
      "প্রতি পিসের দাম ১২ টাকা ৫০ পয়সা",
      "Unit price is 15.50 tk per piece",
      "ডেলিভারি চার্জ মোট ৫০০ টাকা",
      "Total price comes to ৳6250",
      "Price: 120 BDT per unit",

      // 11-15: Specifications and dimensions
      "সাইজ ৭৫০ মিলি, ঢাকনা সহ",
      "Capacity is 500 ml with air tight lid",
      "Dimensions: 10 inch x 12 inch",
      "Wall thickness 50 gauge, weight 25 gm",
      "Paper quality 300 gsm duplex board",

      // 16-20: Dates and delivery schedules
      "Delivery can be made by 2026-10-30",
      "মাল ডেলিভারি হবে 28/10/2026 তারিখে",
      "Expected dispatch date: 2026/11/02",
      "আজকে অর্ডার দিলে ৩ দিনের মধ্যে ডেলিভারি হবে",
      "We deliver within 48 hours of confirmation",

      // 21-25: Codes and order/request references
      "Regarding request REQ-20261027-001 details",
      "Please check order ORD-98765432 specs",
      "Quote submitted for REQ-BOX-750ML",
      "Ref: REQ-4482-DHAKA",
      "Is this matching the spec in REQ-1234?",

      // 26-30+: Product queries, standard negotiations and business discussions
      "রং কি লাল নাকি সাদা হবে?",
      "Can you provide food grade certificate with the batch?",
      "নমুনা কি কাল মিরপুর অফিসে পাঠানো সম্ভব?",
      "Are lids included in this price?",
      "We have PP, PET and aluminium containers available.",
      "Advance payment 50% and 50% on delivery acceptable?",
      "আমাদের কারখানায় এসে কোয়ালিটি দেখে যেতে পারেন।",
      "বক্সগুলো কি মাইক্রোওয়েভ ওভেনে ব্যবহার করা যাবে?",
    ];

    it(`allows all ${legitimateMessages.length} legitimate business messages`, () => {
      expect(legitimateMessages.length).toBeGreaterThanOrEqual(30);
      for (const msg of legitimateMessages) {
        const result = detectContactBypass(msg);
        expect(
          result.hasContact,
          `Expected legitimate message to NOT be flagged: "${msg}" (reason: ${result.reason}, pattern: ${result.pattern})`
        ).toBe(false);
      }
    });
  });

  describe("Known Limitation Logging", () => {
    it("documents spelled-out phone numbers as known limitation", () => {
      // Per spec §8.12: spelled-out number cases are logged as known limitation
      const spelledOut = "zero one seven one two three four five six seven eight";
      const result = detectContactBypass(spelledOut);
      // We document this limitation: NLP/phonetic word spelling is excluded from regex engine
      expect(result.hasContact).toBe(false);
    });
  });
});
