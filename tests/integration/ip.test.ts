import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "../../lib/ip";

const makeReq = (headers: Record<string, string>) =>
  new NextRequest("http://localhost:3000/api/auth/otp/send", { headers });

describe("Client IP extraction behind trusted proxies", () => {
  const prevTrust = process.env.TRUST_PROXY;
  afterEach(() => {
    process.env.TRUST_PROXY = prevTrust;
  });

  it("cloudflare: uses cf-connecting-ip", () => {
    process.env.TRUST_PROXY = "cloudflare";
    expect(getClientIp(makeReq({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }))).toBe(
      "198.51.100.7"
    );
  });

  it("cloudflare: ignores spoofable x-forwarded-for when cf-connecting-ip is missing", () => {
    process.env.TRUST_PROXY = "cloudflare";
    const ip = getClientIp(makeReq({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" }));
    expect(ip).not.toBe("6.6.6.6");
    expect(ip).not.toBe("7.7.7.7");
  });

  it("nginx: uses the rightmost x-forwarded-for entry", () => {
    process.env.TRUST_PROXY = "nginx";
    expect(getClientIp(makeReq({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });
});
