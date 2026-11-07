import * as fs from "fs";
import * as path from "path";
import {
  PrismaClient,
  PlatformRole,
  MemberRole,
  VerificationStatus,
  RequestStatus,
  RequestOutcome,
  QuoteStatus,
  QuoteSource,
  OrderStatus,
  PaymentTerm,
  Priority,
  QuestionStatus,
  VoteTarget,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { runComputeMarketPricesJob } from "../jobs/compute-market-prices";
import { isCriticalKey, placeholdersOf } from "../lib/i18n-critical";

/** The pilot market prices in taka. */
const SEED_CURRENCY = "BDT";
/** Past orders, so a business's history does not read as one repeated line. */
const COMPLETED_TITLES = ["500 pcs 750ml Containers", "750ml lidded containers for lunch boxes", "Monthly restock: 750ml PP containers", "Takeaway containers, 750ml with lid", "750ml clear containers for catering", "Weekend event: 750ml food containers"];

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding BizNet database...");

  // Idempotent cleanup of transactional seed records
  await prisma.aiBudgetCounter.deleteMany({});
  await prisma.reliabilityFeedback.deleteMany({});
  await prisma.orderStatusChange.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.request.updateMany({ data: { awardedQuoteId: null } });
  await prisma.marketPriceSnapshot.deleteMany({});
  await prisma.marketPriceExclusion.deleteMany({});
  await prisma.quoteRevision.deleteMany({});
  await prisma.quote.deleteMany({});
  await prisma.requestInvite.deleteMany({});
  await prisma.contactReveal.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.request.deleteMany({});
  await prisma.vote.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.listing.deleteMany({});
  await prisma.verificationRequest.deleteMany({});
  await prisma.opsTimeLog.deleteMany({});

  // 1. Languages
  await prisma.language.upsert({
    where: { code: "bn" },
    update: { status: "ACTIVE" },
    create: {
      code: "bn",
      nameNative: "বাংলা",
      nameEnglish: "Bengali",
      direction: "ltr",
      fontFamily: "Noto Sans Bengali",
      status: "ACTIVE",
    },
  });

  await prisma.language.upsert({
    where: { code: "en" },
    update: { status: "ACTIVE" },
    create: {
      code: "en",
      nameNative: "English",
      nameEnglish: "English",
      direction: "ltr",
      status: "ACTIVE",
    },
  });

  await prisma.language.upsert({
    where: { code: "ar" },
    update: { status: "DRAFT" },
    create: {
      code: "ar",
      nameNative: "العربية",
      nameEnglish: "Arabic",
      direction: "rtl",
      status: "DRAFT",
    },
  });

  // Seed UiString and UiTranslation records from builtin JSON catalogs
  const enJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "i18n", "builtin", "en.json"), "utf-8")
  );
  const bnJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "i18n", "builtin", "bn.json"), "utf-8")
  );
  const arJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "i18n", "builtin", "ar.json"), "utf-8")
  );

  for (const [key, defaultText] of Object.entries(enJson)) {
    await prisma.uiString.upsert({
      where: { key },
      update: { defaultText: String(defaultText), isCritical: isCriticalKey(key), placeholders: placeholdersOf(String(defaultText)) },
      create: { key, defaultText: String(defaultText), isCritical: isCriticalKey(key), placeholders: placeholdersOf(String(defaultText)) },
    });

    if (bnJson[key]) {
      await prisma.uiTranslation.upsert({
        where: { key_langCode: { key, langCode: "bn" } },
        update: { text: bnJson[key], isApproved: true },
        create: {
          key,
          langCode: "bn",
          text: bnJson[key],
          source: "BUILTIN",
          isApproved: true,
        },
      });
    }

    if (arJson[key]) {
      await prisma.uiTranslation.upsert({
        where: { key_langCode: { key, langCode: "ar" } },
        update: { text: arJson[key], isApproved: true },
        create: {
          key,
          langCode: "ar",
          text: arJson[key],
          source: "BUILTIN",
          isApproved: true,
        },
      });
    }
  }

  // 2. Admin User
  const adminPhone = "+8801700000000";
  const adminUser = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { role: PlatformRole.ADMIN, phoneVerified: true },
    create: {
      phone: adminPhone,
      name: "BizNet Admin",
      role: PlatformRole.ADMIN,
      phoneVerified: true,
      uiLanguage: "en",
    },
  });

  // 3. Seed Categories with attribute schemas (§6)
  const categoriesData = [
    {
      slug: "containers",
      defaultUnits: ["pcs", "box"],
      sortOrder: 1,
      attributeSchema: {
        fields: [
          { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["plastic_pp", "paper", "aluminium"] },
          { key: "capacity_ml", type: "number", min: 0, unit: "ml", filterable: true, comparable: true },
          { key: "has_lid", type: "boolean", filterable: true, comparable: true },
          { key: "microwave_safe", type: "boolean", filterable: true, comparable: true },
        ],
      },
    },
    {
      slug: "food_boxes",
      defaultUnits: ["pcs", "box"],
      sortOrder: 2,
      attributeSchema: {
        fields: [
          { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "kraft", "plastic_pp", "aluminium", "foam"] },
          { key: "size", type: "text", comparable: true },
          { key: "compartments", type: "number", min: 1, filterable: true, comparable: true },
          { key: "has_lid", type: "boolean", filterable: true, comparable: true },
          { key: "printing", type: "select", options: ["none", "custom_logo"], comparable: true },
        ],
      },
    },
    {
      slug: "carry_bags",
      defaultUnits: ["pcs", "pack"],
      sortOrder: 3,
      attributeSchema: {
        fields: [
          { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "kraft", "plastic_pp"] },
          { key: "size", type: "text", comparable: true },
          { key: "handle_type", type: "select", options: ["none", "loop", "die_cut", "twisted"], comparable: true },
          { key: "printing", type: "select", options: ["none", "custom_logo"], comparable: true },
        ],
      },
    },
    {
      slug: "cups",
      defaultUnits: ["pcs", "box"],
      sortOrder: 4,
      attributeSchema: {
        fields: [
          { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["paper", "plastic_pp"] },
          { key: "capacity_ml", type: "number", min: 0, unit: "ml", filterable: true, comparable: true },
          { key: "has_lid", type: "boolean", filterable: true, comparable: true },
        ],
      },
    },
    {
      slug: "tissue",
      defaultUnits: ["pack", "box"],
      sortOrder: 5,
      attributeSchema: {
        fields: [
          { key: "ply", type: "number", min: 1, filterable: true, comparable: true },
          { key: "sheets_per_pack", type: "number", min: 1, filterable: true, comparable: true },
        ],
      },
    },
    {
      slug: "cutlery",
      defaultUnits: ["pcs", "set", "pack"],
      sortOrder: 6,
      attributeSchema: {
        fields: [
          { key: "material", type: "select", required: true, filterable: true, comparable: true, options: ["plastic_pp", "wood"] },
          { key: "item_type", type: "select", options: ["spoon", "fork", "knife", "set"], filterable: true, comparable: true },
        ],
      },
    },
    {
      slug: "foil_wrap",
      defaultUnits: ["roll", "box"],
      sortOrder: 7,
      attributeSchema: {
        fields: [
          { key: "width_cm", type: "number", min: 10, filterable: true, comparable: true },
          { key: "length_m", type: "number", min: 1, filterable: true, comparable: true },
        ],
      },
    },
    {
      slug: "other",
      defaultUnits: ["pcs", "pack", "box"],
      sortOrder: 8,
      attributeSchema: {
        fields: [],
      },
    },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        attributeSchema: cat.attributeSchema,
        defaultUnits: cat.defaultUnits,
        sortOrder: cat.sortOrder,
      },
      create: {
        slug: cat.slug,
        attributeSchema: cat.attributeSchema,
        defaultUnits: cat.defaultUnits,
        sortOrder: cat.sortOrder,
      },
    });
    categories[cat.slug] = created;
  }

  // 4. Seed 6 Suppliers (Dhaka areas: Mirpur, Dhanmondi, Mohammadpur, Uttara, Gulshan, Chawkbazar)
  const supplierSeed = [
    {
      name: "Dhaka Pack & Print",
      slug: "dhaka-pack-print",
      area: "Chawkbazar",
      verificationStatus: VerificationStatus.VERIFIED,
      phone: "+8801711111101",
      ownerName: "Rahim Ahmed",
      listings: [
        { title: "750ml Food Container with Lid", cat: "containers", attrs: { capacity_ml: 750, has_lid: true, material: "plastic_pp", microwave_safe: true }, unit: "pcs", priceMin: 8.5, priceMax: 9.0, moq: 200 },
        { title: "100 pcs Kraft Paper Box", cat: "food_boxes", attrs: { material: "kraft", compartments: 1, has_lid: true, printing: "none" }, unit: "pcs", priceMin: 12.0, priceMax: 14.0, moq: 500 },
        { title: "250ml Paper Cup", cat: "cups", attrs: { capacity_ml: 250, has_lid: true, material: "paper" }, unit: "pcs", priceMin: 3.5, priceMax: 4.0, moq: 1000 },
      ],
    },
    {
      name: "Bengal Disposable Hub",
      slug: "bengal-disposable-hub",
      area: "Mirpur",
      verificationStatus: VerificationStatus.VERIFIED,
      phone: "+8801711111102",
      ownerName: "Karim Uddin",
      listings: [
        { title: "500ml 3-Chamber Food Box", cat: "food_boxes", attrs: { material: "plastic_pp", compartments: 3, has_lid: true, printing: "none" }, unit: "pcs", priceMin: 15.0, priceMax: 16.5, moq: 300 },
        { title: "750ml PP Container", cat: "containers", attrs: { capacity_ml: 750, has_lid: true, material: "plastic_pp", microwave_safe: true }, unit: "pcs", priceMin: 8.8, priceMax: 9.2, moq: 250 },
        { title: "Facial Tissue 2-Ply Pack", cat: "tissue", attrs: { ply: 2, sheets_per_pack: 100 }, unit: "pack", priceMin: 45.0, priceMax: 50.0, moq: 50 },
      ],
    },
    {
      name: "Green Eco Packaging",
      slug: "green-eco-packaging",
      area: "Dhanmondi",
      verificationStatus: VerificationStatus.BASIC,
      phone: "+8801711111103",
      ownerName: "Tanvir Hasan",
      listings: [
        { title: "Kraft Paper Carry Bag", cat: "carry_bags", attrs: { material: "kraft", handle_type: "twisted", printing: "custom_logo" }, unit: "pcs", priceMin: 18.0, priceMax: 22.0, moq: 500 },
        { title: "Aluminum Foil Roll 30m", cat: "foil_wrap", attrs: { width_cm: 30, length_m: 30 }, unit: "roll", priceMin: 180.0, priceMax: 200.0, moq: 10 },
        { title: "Disposable Plastic Spoons", cat: "cutlery", attrs: { material: "plastic_pp", item_type: "spoon" }, unit: "pcs", priceMin: 1.2, priceMax: 1.5, moq: 1000 },
      ],
    },
    {
      name: "Uttara Box & Bag",
      slug: "uttara-box-bag",
      area: "Uttara",
      verificationStatus: VerificationStatus.BASIC,
      phone: "+8801711111104",
      ownerName: "Mahbub Alam",
      listings: [
        { title: "Burger Kraft Box", cat: "food_boxes", attrs: { material: "kraft", compartments: 1, has_lid: true, printing: "custom_logo" }, unit: "pcs", priceMin: 9.0, priceMax: 11.0, moq: 500 },
        { title: "750ml Clear Container", cat: "containers", attrs: { capacity_ml: 750, has_lid: true, material: "plastic_pp", microwave_safe: true }, unit: "pcs", priceMin: 8.7, priceMax: 9.1, moq: 200 },
        { title: "Disposable Paper Glass", cat: "cups", attrs: { capacity_ml: 200, has_lid: false, material: "paper" }, unit: "pcs", priceMin: 2.8, priceMax: 3.2, moq: 1000 },
      ],
    },
    {
      name: "Mohammadpur Packaging Mart",
      slug: "mohammadpur-packaging-mart",
      area: "Mohammadpur",
      verificationStatus: VerificationStatus.VERIFIED,
      phone: "+8801711111105",
      ownerName: "Shafiqul Islam",
      listings: [
        { title: "750ml Round Food Container", cat: "containers", attrs: { capacity_ml: 750, has_lid: true, material: "plastic_pp", microwave_safe: true }, unit: "pcs", priceMin: 8.9, priceMax: 9.3, moq: 300 },
        { title: "Die-Cut Plastic Bags", cat: "carry_bags", attrs: { material: "plastic_pp", handle_type: "die_cut", printing: "none" }, unit: "pcs", priceMin: 5.0, priceMax: 6.5, moq: 1000 },
        { title: "Napkin Paper Tissue Pack", cat: "tissue", attrs: { ply: 1, sheets_per_pack: 50 }, unit: "pack", priceMin: 20.0, priceMax: 25.0, moq: 100 },
      ],
    },
    {
      name: "Gulshan Premium Disposables",
      slug: "gulshan-premium-disposables",
      area: "Gulshan",
      verificationStatus: VerificationStatus.VERIFIED,
      phone: "+8801711111106",
      ownerName: "Fahim Shahriar",
      listings: [
        { title: "Premium Black Paper Cup 350ml", cat: "cups", attrs: { capacity_ml: 350, has_lid: true, material: "paper" }, unit: "pcs", priceMin: 6.0, priceMax: 7.5, moq: 500 },
        { title: "Wooden Eco Cutlery Set", cat: "cutlery", attrs: { material: "wood", item_type: "set" }, unit: "set", priceMin: 8.0, priceMax: 10.0, moq: 200 },
        { title: "750ml Premium Food Box", cat: "containers", attrs: { capacity_ml: 750, has_lid: true, material: "plastic_pp", microwave_safe: true }, unit: "pcs", priceMin: 9.5, priceMax: 10.5, moq: 200 },
      ],
    },
  ];

  const supplierBusinesses: any[] = [];
  for (const s of supplierSeed) {
    const user = await prisma.user.upsert({
      where: { phone: s.phone },
      update: { name: s.ownerName, phoneVerified: true },
      create: { phone: s.phone, name: s.ownerName, phoneVerified: true, uiLanguage: "en" },
    });

    const business = await prisma.business.upsert({
      where: { slug: s.slug },
      update: { verificationStatus: s.verificationStatus },
      create: {
        slug: s.slug,
        name: s.name,
        businessType: "Packaging Supplier",
        isSupplier: true,
        isBuyer: false,
        area: s.area,
        city: "Dhaka",
        addressLine: `${s.area}, Dhaka`,
        verificationStatus: s.verificationStatus,
        verifiedAt: s.verificationStatus === VerificationStatus.VERIFIED ? new Date() : null,
      },
    });

    await prisma.membership.upsert({
      where: { userId_businessId: { userId: user.id, businessId: business.id } },
      update: { role: MemberRole.OWNER },
      create: { userId: user.id, businessId: business.id, role: MemberRole.OWNER },
    });

    // Supplier Categories
    for (const l of s.listings) {
      const cat = categories[l.cat];
      if (cat) {
        await prisma.supplierCategory.upsert({
          where: { businessId_categoryId: { businessId: business.id, categoryId: cat.id } },
          update: {},
          create: { businessId: business.id, categoryId: cat.id },
        });

        // Create Listing
        await prisma.listing.create({
          data: {
            businessId: business.id,
            categoryId: cat.id,
            title: l.title,
            attributes: l.attrs,
            unit: l.unit,
            currency: SEED_CURRENCY,
            priceMin: new Decimal(l.priceMin),
            priceMax: new Decimal(l.priceMax),
            moq: l.moq,
            leadTimeDays: 2,
          },
        });
      }
    }

    supplierBusinesses.push({ business, user });
  }

  // 5. Seed 6 Buyers (Restaurants / Cafes)
  const buyerSeed = [
    { name: "Sultan's Dine", slug: "sultans-dine", area: "Dhanmondi", phone: "+8801722222201", ownerName: "Mizanur Rahman" },
    { name: "Takeout Burger", slug: "takeout-burger", area: "Mirpur", phone: "+8801722222202", ownerName: "Ashik Iqbal" },
    { name: "North End Coffee", slug: "north-end-coffee", area: "Gulshan", phone: "+8801722222203", ownerName: "Rick Larson" },
    { name: "Kolkata Kacchi Ghor", slug: "kolkata-kacchi-ghor", area: "Mohammadpur", phone: "+8801722222204", ownerName: "Kamrul Islam" },
    { name: "Chillox Burger", slug: "chillox-burger", area: "Uttara", phone: "+8801722222205", ownerName: "Wasif Ahmed" },
    { name: "Star Kabab & Restaurant", slug: "star-kabab", area: "Dhanmondi", phone: "+8801722222206", ownerName: "Akhtar Hossain" },
  ];

  const buyerBusinesses: any[] = [];
  for (const b of buyerSeed) {
    const user = await prisma.user.upsert({
      where: { phone: b.phone },
      update: { name: b.ownerName, phoneVerified: true },
      create: { phone: b.phone, name: b.ownerName, phoneVerified: true, uiLanguage: "en" },
    });

    const business = await prisma.business.upsert({
      where: { slug: b.slug },
      update: {},
      create: {
        slug: b.slug,
        name: b.name,
        businessType: "Restaurant / Café",
        isBuyer: true,
        isSupplier: false,
        area: b.area,
        city: "Dhaka",
        addressLine: `${b.area}, Dhaka`,
        verificationStatus: VerificationStatus.UNVERIFIED,
      },
    });

    await prisma.membership.upsert({
      where: { userId_businessId: { userId: user.id, businessId: business.id } },
      update: { role: MemberRole.OWNER },
      create: { userId: user.id, businessId: business.id, role: MemberRole.OWNER },
    });

    buyerBusinesses.push({ business, user });
  }

  // 6. Seed 2 Completed Orders with Reliability Feedback
  for (let i = 0; i < 2; i++) {
    const buyer = buyerBusinesses[i];
    const supplier = supplierBusinesses[i];
    const cat = categories["containers"];

    const req = await prisma.request.create({
      data: {
        code: `REQ-SEED-COMPLETED-${i + 1}`,
        buyerBusinessId: buyer.business.id,
        createdByUserId: buyer.user.id,
        categoryId: cat.id,
        title: COMPLETED_TITLES[i % COMPLETED_TITLES.length],
        quantity: new Decimal(500),
        unit: "pcs",
        deliveryArea: "Mirpur",
        status: RequestStatus.AWARDED,
        outcome: RequestOutcome.ORDER_COMPLETED,
        attributes: { capacity_ml: 750, has_lid: true, material: "plastic_pp" },
      },
    });

    const quote = await prisma.quote.create({
      data: {
        requestId: req.id,
        supplierBusinessId: supplier.business.id,
        createdByUserId: supplier.user.id,
        unitPrice: new Decimal(9.0),
        currency: SEED_CURRENCY,
        quantity: new Decimal(500),
        deliveryCharge: new Decimal(100),
        totalPrice: new Decimal(4600),
        deliveryDays: 2,
        paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
        validUntil: new Date(Date.now() + 7 * 86400000),
        specMatch: { capacity_ml: "MATCH", has_lid: "MATCH", material: "MATCH" },
        status: QuoteStatus.ACCEPTED,
      },
    });

    await prisma.request.update({
      where: { id: req.id },
      data: { awardedQuoteId: quote.id },
    });

    // A second quote the buyer did not choose. No confirmed spec, so market prices leave it out
    if (i === 1) {
      await prisma.quote.create({
        data: {
          requestId: req.id,
          supplierBusinessId: supplierBusinesses[(i + 1) % supplierBusinesses.length].business.id,
          createdByUserId: supplierBusinesses[(i + 1) % supplierBusinesses.length].user.id,
          unitPrice: new Decimal(10.0),
          currency: SEED_CURRENCY,
          quantity: new Decimal(500),
          deliveryCharge: new Decimal(100),
          totalPrice: new Decimal(5100),
          deliveryDays: 3,
          paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
          validUntil: new Date(Date.now() + 7 * 86400000),
          specMatch: {},
          status: QuoteStatus.REJECTED,
        },
      });
    }

    const order = await prisma.order.create({
      data: {
        code: `ORD-SEED-${i + 1}`,
        requestId: req.id,
        quoteId: quote.id,
        buyerBusinessId: buyer.business.id,
        supplierBusinessId: supplier.business.id,
        status: OrderStatus.COMPLETED,
        snapshot: {
          price: "9",
          deliveryCharge: "100",
          total: "4600",
          currency: SEED_CURRENCY,
          quantity: "500",
          unit: "pcs",
          deliveryDays: 2,
          paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
          specDifferences: { capacity_ml: "MATCH", has_lid: "MATCH", material: "MATCH" },
          notes: null,
          requestTitle: COMPLETED_TITLES[i % COMPLETED_TITLES.length],
        },
        statusHistory: {
          create: [
            { toStatus: OrderStatus.CONFIRMED, actorSide: "SUPPLIER", createdAt: new Date(Date.now() - 5 * 86400000) },
            { fromStatus: OrderStatus.CONFIRMED, toStatus: OrderStatus.DISPATCHED, actorSide: "SUPPLIER", createdAt: new Date(Date.now() - 3 * 86400000) },
            { fromStatus: OrderStatus.DISPATCHED, toStatus: OrderStatus.DELIVERED, actorSide: "SUPPLIER", createdAt: new Date(Date.now() - 2 * 86400000) },
            { fromStatus: OrderStatus.DELIVERED, toStatus: OrderStatus.COMPLETED, actorSide: "BUYER", createdAt: new Date(Date.now() - 1 * 86400000) },
          ],
        },
        dispatchedAt: new Date(Date.now() - 3 * 86400000),
        deliveredAt: new Date(Date.now() - 2 * 86400000),
        completedAt: new Date(Date.now() - 1 * 86400000),
      },
    });

    await prisma.reliabilityFeedback.create({
      data: {
        orderId: order.id,
        createdByUserId: buyer.user.id,
        onTime: true,
        quantityCorrect: true,
        matchedSpec: true,
        hadIssue: false,
      },
    });
  }

  // 7. Seed 1 OPEN Request with 2 quotes (one arriving after needed-by, one with spec difference)
  const openBuyer = buyerBusinesses[2];
  const openReq = await prisma.request.create({
    data: {
      code: "REQ-SEED-OPEN-1",
      buyerBusinessId: openBuyer.business.id,
      createdByUserId: openBuyer.user.id,
      categoryId: categories["containers"].id,
      title: "Need 500 pcs 750ml Containers with Lid in Mirpur by tomorrow",
      quantity: new Decimal(500),
      unit: "pcs",
      neededBy: new Date(Date.now() + 86400000), // tomorrow
      deliveryArea: "Mirpur",
      preferredPaymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      priority: Priority.SPEED,
      status: RequestStatus.OPEN,
      closesAt: new Date(Date.now() + 48 * 3600000),
      attributes: { capacity_ml: 750, has_lid: true, material: "plastic_pp" },
    },
  });

  // Quote 1: Spec difference (material: paper instead of plastic_pp)
  await prisma.quote.create({
    data: {
      requestId: openReq.id,
      supplierBusinessId: supplierBusinesses[0].business.id,
      createdByUserId: supplierBusinesses[0].user.id,
      unitPrice: new Decimal(8.8),
      currency: SEED_CURRENCY,
      quantity: new Decimal(500),
      deliveryCharge: new Decimal(80),
      totalPrice: new Decimal(4480),
      deliveryDays: 1, // arrives on time
      paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      validUntil: new Date(Date.now() + 3 * 86400000),
      specMatch: { capacity_ml: "MATCH", has_lid: "MATCH", material: "DIFFERENT" },
      notes: "Paper containers offered instead of plastic",
      status: QuoteStatus.SUBMITTED,
    },
  });

  // Quote 2: Arrives late (deliveryDays: 3 > needed tomorrow)
  await prisma.quote.create({
    data: {
      requestId: openReq.id,
      supplierBusinessId: supplierBusinesses[1].business.id,
      createdByUserId: supplierBusinesses[1].user.id,
      unitPrice: new Decimal(8.5),
      currency: SEED_CURRENCY,
      quantity: new Decimal(500),
      deliveryCharge: new Decimal(50),
      totalPrice: new Decimal(4300),
      deliveryDays: 3, // arrives late
      paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      validUntil: new Date(Date.now() + 3 * 86400000),
      specMatch: { capacity_ml: "MATCH", has_lid: "MATCH", material: "MATCH" },
      notes: "Delivery takes 3 days",
      status: QuoteStatus.SUBMITTED,
    },
  });

  // 8. Seed 1 Request with 0 quotes
  await prisma.request.create({
    data: {
      code: "REQ-SEED-EMPTY-1",
      buyerBusinessId: buyerBusinesses[3].business.id,
      createdByUserId: buyerBusinesses[3].user.id,
      categoryId: categories["foil_wrap"].id,
      title: "10 Rolls Heavy-Duty Aluminum Foil",
      quantity: new Decimal(10),
      unit: "roll",
      deliveryArea: "Mohammadpur",
      status: RequestStatus.OPEN,
      closesAt: new Date(Date.now() + 48 * 3600000),
      attributes: { width_cm: 30, length_m: 50 },
    },
  });

  // 9. Seed 5 Discussion Questions (2 solved)
  const qData: { title: string; body: string; solved: boolean; cat: string }[] = [
    { title: "How long does food stay hot in PP 3-chamber food boxes?", body: "What is the standard procedure to test food-grade packaging quality?", solved: true, cat: "food_boxes" },
    { title: "How much weight can a 100 GSM kraft paper bag reliably hold?", body: "Looking for verified load limits for twisted-handle kraft bags.", solved: true, cat: "carry_bags" },
    { title: "Where to source wholesale plastic cups with dome lids in bulk?", body: "Who are the best verified container and cup distributors?", solved: false, cat: "cups" },
    { title: "What is the standard shipping rate structure for packaging deliveries?", body: "What is the typical intra-city flat rate for heavy packaging cartons?", solved: false, cat: "containers" },
    { title: "What are typical setup costs for custom 2-color brand logo printing?", body: "Is there any supplier offering low-MOQ custom printing from 100 pcs?", solved: false, cat: "food_boxes" },
  ];

  for (let i = 0; i < qData.length; i++) {
    const q = qData[i];
    const question = await prisma.question.create({
      data: {
        authorUserId: buyerBusinesses[i % buyerBusinesses.length].user.id,
        authorBusinessId: buyerBusinesses[i % buyerBusinesses.length].business.id,
        categoryId: categories[q.cat].id,
        title: q.title,
        body: q.body,
        status: q.solved ? QuestionStatus.SOLVED : QuestionStatus.OPEN,
      },
    });

    const answer = await prisma.answer.create({
      data: {
        questionId: question.id,
        authorUserId: supplierBusinesses[i % supplierBusinesses.length].user.id,
        authorBusinessId: supplierBusinesses[i % supplierBusinesses.length].business.id,
        body: "Food-grade PP plastic with tightly sealed airtight lids keeps food warm for 2 to 3 hours.",
      },
    });

    if (q.solved) {
      await prisma.question.update({
        where: { id: question.id },
        data: { acceptedAnswerId: answer.id },
      });
    }

    // Add sample vote
    await prisma.vote.create({
      data: {
        userId: adminUser.id,
        targetType: VoteTarget.QUESTION,
        targetId: question.id,
        value: 1,
      },
    });
  }

  // 10. Market prices (§15): recent supplier quotes on closed requests, then the real job.
  // Group A — 750 ml PP containers with lid, 500–999 pcs, delivery charged, Mirpur:
  //   with the 2 completed orders and the matching OPEN quote above → 10 quotes from 6 suppliers → publishable.
  // Group B — 250 ml paper cups with lid, 1000–4999 pcs, delivery included, Gulshan:
  //   3 quotes from 2 suppliers → "Not enough data yet".
  const historyRequest = async (code: string, buyerIdx: number, cat: string, attributes: Record<string, string | number | boolean>, quantity: number, area: string, daysAgo: number) =>
    prisma.request.create({
      data: {
        code,
        buyerBusinessId: buyerBusinesses[buyerIdx].business.id,
        createdByUserId: buyerBusinesses[buyerIdx].user.id,
        categoryId: categories[cat].id,
        title: cat === "cups" ? "1000 pcs 250ml Paper Cups" : "500 pcs 750ml Containers",
        quantity: new Decimal(quantity),
        unit: "pcs",
        deliveryArea: area,
        status: RequestStatus.CLOSED,
        closesAt: new Date(Date.now() - (daysAgo - 2) * 86400000),
        createdAt: new Date(Date.now() - daysAgo * 86400000),
        attributes,
      },
    });
  const historyQuote = async (requestId: string, supplierIdx: number, unitPrice: number, quantity: number, deliveryCharge: number, specMatch: Record<string, string>, daysAgo: number) =>
    prisma.quote.create({
      data: {
        requestId,
        supplierBusinessId: supplierBusinesses[supplierIdx].business.id,
        createdByUserId: supplierBusinesses[supplierIdx].user.id,
        unitPrice: new Decimal(unitPrice),
        currency: SEED_CURRENCY,
        quantity: new Decimal(quantity),
        deliveryCharge: new Decimal(deliveryCharge),
        totalPrice: new Decimal(unitPrice * quantity + deliveryCharge),
        deliveryDays: 2,
        paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
        validUntil: new Date(Date.now() - (daysAgo - 5) * 86400000),
        specMatch,
        status: QuoteStatus.SUBMITTED,
        createdAt: new Date(Date.now() - daysAgo * 86400000),
      },
    });

  const containerSpec = { capacity_ml: 750, has_lid: true, material: "plastic_pp" };
  const containerMatch = { capacity_ml: "MATCH", has_lid: "MATCH", material: "MATCH" };
  const h1 = await historyRequest("REQ-SEED-HIST-1", 1, "containers", containerSpec, 500, "Mirpur", 20);
  await historyQuote(h1.id, 2, 8.6, 500, 120, containerMatch, 19);
  await historyQuote(h1.id, 3, 8.8, 500, 100, containerMatch, 19);
  await historyQuote(h1.id, 4, 9.1, 500, 150, containerMatch, 18);
  const h2 = await historyRequest("REQ-SEED-HIST-2", 1, "containers", containerSpec, 600, "Mirpur", 12);
  await historyQuote(h2.id, 5, 8.9, 600, 100, containerMatch, 11);
  await historyQuote(h2.id, 3, 9.2, 600, 80, containerMatch, 11);
  await historyQuote(h2.id, 4, 8.7, 600, 100, containerMatch, 10);
  const h3 = await historyRequest("REQ-SEED-HIST-3", 1, "containers", containerSpec, 500, "Mirpur", 6);
  await historyQuote(h3.id, 2, 9.0, 500, 100, containerMatch, 5);

  const cupSpec = { capacity_ml: 250, has_lid: true, material: "paper" };
  const cupMatch = { capacity_ml: "MATCH", has_lid: "MATCH", material: "MATCH" };
  const h4 = await historyRequest("REQ-SEED-HIST-4", 2, "cups", cupSpec, 1000, "Gulshan", 9);
  await historyQuote(h4.id, 0, 3.6, 1000, 0, cupMatch, 8);
  await historyQuote(h4.id, 3, 3.9, 1000, 0, cupMatch, 8);
  const h5 = await historyRequest("REQ-SEED-HIST-5", 2, "cups", cupSpec, 1200, "Gulshan", 4);
  await historyQuote(h5.id, 0, 3.7, 1200, 0, cupMatch, 3);

  const prices = await runComputeMarketPricesJob();
  console.log(`Market prices: ${prices.groups} groups, ${prices.publishable} publishable`);

  console.log("✅ Seed completed successfully with buyers, suppliers, categories, orders, quotes, questions, and market snapshots.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
