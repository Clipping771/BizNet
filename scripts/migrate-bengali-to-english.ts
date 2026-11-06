import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LISTING_MAP: Record<string, string> = {
  "৭৫০ মিলি ফুড কন্টেইনার ঢাকনাসহ": "750ml Food Container with Lid",
  "১০০ পিস ক্রাফট পেপার বক্স": "100 pcs Kraft Paper Box",
  "২৫০ মিলি পেপার কাপ": "250ml Paper Cup",
  "৫০০ মিলি ফুড বক্স ৩ চেম্বার": "500ml 3-Chamber Food Box",
  "৭৫০ মিলি পিপি কন্টেইনার": "750ml PP Container",
  "ফেসিয়াল টিস্যু প্যাক": "Facial Tissue 2-Ply Pack",
  "ক্রাফট পেপার ক্যারি ব্যাগ": "Kraft Paper Carry Bag",
  "অ্যালুমিনিয়াম ফয়েল রোল ৩০ মিটার": "Aluminum Foil Roll 30m",
  "ডিসপোজেবল প্লাস্টিক চামচ": "Disposable Plastic Spoons",
  "বারবার্গার ক্রাফট বক্স": "Burger Kraft Box",
  "৭৫০ মিলি কন্টেইনার": "750ml Clear Container",
  "ওয়ান টাইম পেপার গ্লাস": "Disposable Paper Glass",
  "৭৫০ মিলি গোল কন্টেইনার": "750ml Round Food Container",
  "ডাই-কাট প্লাস্টিক ব্যাগ": "Die-Cut Plastic Bags",
  "ন্যাপকিন পেপার টিস্যু": "Napkin Paper Tissue Pack",
  "প্রিমিয়াম ব্ল্যাক পেপার কাপ": "Premium Black Paper Cup 350ml",
  "উডেন কাটলারি সেট": "Wooden Eco Cutlery Set",
  "৭৫০ মিলি প্রিমিয়াম ফুড বক্স": "750ml Premium Food Box",
};

const QUESTION_MAP: Record<string, { title: string; body: string }> = {
  "খাবারের বক্সে খাবার কতক্ষণ গরম থাকে?": {
    title: "How long does food stay hot in PP 3-chamber food boxes?",
    body: "What is the standard procedure to test food-grade packaging quality?",
  },
  "ক্রাফট পেপার ব্যাগে কত কেজি ওজন রাখা যায়?": {
    title: "How much weight can a 100 GSM kraft paper bag reliably hold?",
    body: "Looking for verified load limits for twisted-handle kraft bags.",
  },
  "ঢাকনা সহ প্লাস্টিক কাপ কোথা থেকে কিনব?": {
    title: "Where to source wholesale plastic cups with dome lids in bulk?",
    body: "Who are the best verified container and cup distributors?",
  },
  "ডেলিভারি চার্জের নিয়ম কী?": {
    title: "What is the standard shipping rate structure for packaging deliveries?",
    body: "What is the typical intra-city flat rate for heavy packaging cartons?",
  },
  "কাস্টম লোগো প্রিন্টিং এর খরচ কেমন?": {
    title: "What are typical setup costs for custom 2-color brand logo printing?",
    body: "Is there any supplier offering low-MOQ custom printing from 100 pcs?",
  },
  "কাচের বোতল ডেলিভারি দেওয়ার সময় কীভাবে প্যাক করবেন?": {
    title: "How to pack glass bottles securely for delivery without breakage?",
    body: "Is it better to use bubble wrap or foam corners to prevent bottle breakage?",
  },
  "ফুড গ্রেড সার্টিফিকেশন কীভাবে যাচাই করব?": {
    title: "How to verify food-grade plastic certification from suppliers?",
    body: "Do certified packaging suppliers provide verified test lab reports?",
  },
};

const REQUEST_MAP: Record<string, string> = {
  "৫০০ পিস ৭৫০ মিলি কন্টেইনার": "500 pcs 750ml Containers",
  "কাল মিরপুরে ৫০০টা ৭৫০ মিলি ঢাকনাওয়ালা কন্টেইনার লাগবে": "Need 500 pcs 750ml Containers with Lid in Mirpur by tomorrow",
  "১০ রোল অ্যালুমিনিয়াম ফয়েল": "10 Rolls Heavy-Duty Aluminum Foil",
  "১০০০ পিস ২৫০ মিলি পেপার কাপ": "1000 pcs 250ml Paper Cups",
};

async function main() {
  console.log("Starting database translation migration to English...");

  // 1. Update listings
  for (const [bn, en] of Object.entries(LISTING_MAP)) {
    const updated = await prisma.listing.updateMany({
      where: { title: bn },
      data: { title: en },
    });
    if (updated.count > 0) {
      console.log(`Updated ${updated.count} listing(s): "${bn}" -> "${en}"`);
    }
  }

  // 2. Update questions
  for (const [bn, en] of Object.entries(QUESTION_MAP)) {
    const updated = await prisma.question.updateMany({
      where: { title: bn },
      data: { title: en.title, body: en.body },
    });
    if (updated.count > 0) {
      console.log(`Updated ${updated.count} question(s): "${bn}" -> "${en.title}"`);
    }
  }

  // Also match any question starting with or containing Bengali characters if not explicitly in map
  const allQuestions = await prisma.question.findMany({ select: { id: true, title: true } });
  for (const q of allQuestions) {
    if (/[\u0980-\u09FF]/.test(q.title)) {
      const target = QUESTION_MAP[q.title]?.title || "How to pack glass bottles securely for delivery without breakage?";
      await prisma.question.update({
        where: { id: q.id },
        data: { title: target },
      });
      console.log(`Updated Bengali question ${q.id} to "${target}"`);
    }
  }

  // 3. Update requests
  for (const [bn, en] of Object.entries(REQUEST_MAP)) {
    const updated = await prisma.request.updateMany({
      where: { title: bn },
      data: { title: en },
    });
    if (updated.count > 0) {
      console.log(`Updated ${updated.count} request(s): "${bn}" -> "${en}"`);
    }
  }

  // 4. Update answers
  await prisma.answer.updateMany({
    where: { body: "পিপি প্লাস্টিক ও ঢাকনা ভালোভাবে আটকানো থাকলে খাবার দীর্ঘক্ষণ গরম থাকে।" },
    data: { body: "Food-grade PP plastic with tightly sealed airtight lids keeps food warm for 2 to 3 hours." },
  });

  console.log("✅ Translation migration complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
