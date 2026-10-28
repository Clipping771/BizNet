/**
 * List screens' APIs: /api/orders, /api/quotes, /api/conversations (unread + side),
 * /api/notifications (+ read, scoped to the user), /api/home, and ORDER_STATUS notifications.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { OrderStatus, PaymentTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionOptions } from "@/lib/session";
import { createBusiness } from "@/lib/repo/business";
import { createRequestRecord } from "@/lib/repo/request";
import { submitQuoteRecord, acceptQuoteAndCreateOrderRecord } from "@/lib/repo/quote";
import { updateOrderStatusRecord } from "@/lib/repo/order";
import { getOrCreateConversationRecord, sendMessageRecord } from "@/lib/repo/messaging";
import { GET as ordersRoute } from "@/app/api/orders/route";
import { GET as quotesRoute } from "@/app/api/quotes/route";
import { GET as conversationsRoute } from "@/app/api/conversations/route";
import { GET as notificationsRoute } from "@/app/api/notifications/route";
import { POST as readRoute } from "@/app/api/notifications/read/route";
import { GET as homeRoute } from "@/app/api/home/route";

const BASE = "http://localhost:3000";
const phone = () => `+88019${Math.floor(10000000 + Math.random() * 90000000)}`;
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
const cookie = async (userId: string, activeBusinessId: string) =>
  `biznet_session=${await sealData({ userId, activeBusinessId, isLoggedIn: true }, sessionOptions)}`;
const get = (url: string, c: string) => new NextRequest(`${BASE}${url}`, { headers: { cookie: c } });

describe("list screen APIs", () => {
  let buyerUser: any, buyer: any, buyerCookie: string;
  let supplierUser: any, supplier: any, supplierCookie: string;
  let orderCode: string;
  let conversationId: string;

  beforeAll(async () => {
    const categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "containers" } })).id;
    buyerUser = await prisma.user.create({ data: { phone: phone(), name: "List Buyer", phoneVerified: true } });
    buyer = await createBusiness(buyerUser.id, { name: `List Buyer ${word()}`, businessType: "Restaurant", isBuyer: true, isSupplier: false, area: "Mirpur", city: "Dhaka", addressLine: "x" } as any);
    supplierUser = await prisma.user.create({ data: { phone: phone(), name: "List Supplier", phoneVerified: true } });
    supplier = await createBusiness(supplierUser.id, { name: `List Supplier ${word()}`, businessType: "Supplier", isBuyer: false, isSupplier: true, area: "Mirpur", city: "Dhaka", addressLine: "x", categoryIds: [categoryId] } as any);
    await prisma.business.update({ where: { id: supplier.id }, data: { verificationStatus: "VERIFIED", deliveryAreas: ["Mirpur"] } });
    buyerCookie = await cookie(buyerUser.id, buyer.id);
    supplierCookie = await cookie(supplierUser.id, supplier.id);

    const req = await createRequestRecord({
      buyerBusinessId: buyer.id,
      createdByUserId: buyerUser.id,
      categoryId,
      title: `List screens ${word()}`,
      attributes: { material: "plastic_pp" },
      quantity: 100,
      unit: "pcs",
      deliveryArea: "Mirpur",
      quoteWindowHours: 48,
    });
    const quote = await submitQuoteRecord({
      requestId: req.id,
      supplierBusinessId: supplier.id,
      createdByUserId: supplierUser.id,
      unitPrice: "10",
      quantity: "100",
      deliveryDays: 2,
      paymentTerm: PaymentTerm.CASH_ON_DELIVERY,
      validUntil: new Date(Date.now() + 3 * 86400000),
      specMatch: { material: "MATCH" },
    });
    const conv = await getOrCreateConversationRecord(req.id, buyer.id, supplier.id);
    conversationId = conv.id;
    await sendMessageRecord({ conversationId: conv.id, senderUserId: supplierUser.id, senderBusinessId: supplier.id, body: "Ready when you are" });
    await sendMessageRecord({ conversationId: conv.id, senderUserId: supplierUser.id, senderBusinessId: supplier.id, body: "Free delivery in Mirpur" });
    const order = await acceptQuoteAndCreateOrderRecord(quote.id, buyer.id, buyerUser.id);
    orderCode = order.code;
    await updateOrderStatusRecord({ orderId: order.id, toStatus: OrderStatus.DISPATCHED, actorSide: "SUPPLIER", actorUserId: supplierUser.id });
  });

  it("lists orders for both sides with the other party", async () => {
    const asBuyer = await (await ordersRoute(get("/api/orders", buyerCookie))).json();
    const row = asBuyer.orders.find((o: any) => o.code === orderCode);
    expect(row).toMatchObject({ side: "BUYER", otherParty: supplier.name, status: "DISPATCHED" });
    const asSupplier = await (await ordersRoute(get("/api/orders", supplierCookie))).json();
    expect(asSupplier.orders.find((o: any) => o.code === orderCode)).toMatchObject({ side: "SUPPLIER", otherParty: buyer.name });
  });

  it("lists a supplier's own quotes with the resulting order", async () => {
    const quotes = (await (await quotesRoute(get("/api/quotes", supplierCookie))).json()).quotes;
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ status: "ACCEPTED", order: { code: orderCode } });
    expect((await (await quotesRoute(get("/api/quotes", buyerCookie))).json()).quotes).toHaveLength(0);
  });

  it("shows unread counts and the viewer's side per conversation", async () => {
    const list = await (await conversationsRoute(get("/api/conversations", buyerCookie))).json();
    const conv = list.find((c: any) => c.id === conversationId);
    expect(conv).toMatchObject({ unread: 2, side: "BUYER" });
    const supplierList = await (await conversationsRoute(get("/api/conversations", supplierCookie))).json();
    expect(supplierList.find((c: any) => c.id === conversationId)).toMatchObject({ unread: 0, side: "SUPPLIER" });
  });

  it("notifies the buyer of order status changes and marks only the user's own notifications read", async () => {
    const data = await (await notificationsRoute(get("/api/notifications", buyerCookie))).json();
    const types = data.notifications.map((n: any) => n.type);
    expect(types).toEqual(expect.arrayContaining(["QUOTE_RECEIVED", "ORDER_STATUS"]));
    const statusNote = data.notifications.find((n: any) => n.type === "ORDER_STATUS");
    expect(statusNote.params).toMatchObject({ orderCode, status: "DISPATCHED" });
    expect(data.unread).toBeGreaterThan(0);

    // The supplier cannot mark the buyer's notifications
    const foreign = await (await readRoute(new NextRequest(`${BASE}/api/notifications/read`, { method: "POST", headers: { cookie: supplierCookie, "content-type": "application/json" }, body: JSON.stringify({ ids: [statusNote.id] }) }))).json();
    expect(foreign.marked).toBe(0);

    await readRoute(new NextRequest(`${BASE}/api/notifications/read`, { method: "POST", headers: { cookie: buyerCookie, "content-type": "application/json" }, body: "{}" }));
    expect((await (await notificationsRoute(get("/api/notifications?count=1", buyerCookie))).json()).unread).toBe(0);
  });

  it("summarises the home screen", async () => {
    const home = await (await homeRoute(get("/api/home", buyerCookie))).json();
    expect(home).toMatchObject({ activeOrders: 1, unreadMessages: 2, openRequests: 0 });
    expect(home.recentRequests[0].status).toBe("AWARDED");
  });
});
