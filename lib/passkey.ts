import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { publicAppUrl } from "@/lib/app-url";

export function getRpConfig(): { rpID: string; expectedOrigin: string; rpName: string } {
  const appUrl = publicAppUrl();
  if (process.env.NODE_ENV === "production") {
    if (!appUrl) {
      throw new Error(
        "CRITICAL SECURITY CONFIGURATION ERROR: APP_URL (or Render's RENDER_EXTERNAL_URL) must be configured in production"
      );
    }
    // The relying-party ID is the site's host name unless RP_ID says otherwise (e.g. a parent domain)
    return { rpID: process.env.RP_ID || new URL(appUrl).hostname, expectedOrigin: appUrl, rpName: "BizNet" };
  }

  const rpID = process.env.RP_ID || "localhost";
  const expectedOrigin = appUrl || "http://localhost:3000";
  const rpName = "BizNet";

  return { rpID, expectedOrigin, rpName };
}

export {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
};
