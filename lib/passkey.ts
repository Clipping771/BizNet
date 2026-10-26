import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

export function getRpConfig(): { rpID: string; expectedOrigin: string; rpName: string } {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.RP_ID || !process.env.APP_URL) {
      throw new Error(
        "CRITICAL SECURITY CONFIGURATION ERROR: RP_ID and APP_URL must be configured in production"
      );
    }
    return {
      rpID: process.env.RP_ID,
      expectedOrigin: process.env.APP_URL,
      rpName: "BizNet",
    };
  }

  const rpID = process.env.RP_ID || "localhost";
  const expectedOrigin = process.env.APP_URL || "http://localhost:3000";
  const rpName = "BizNet";

  return { rpID, expectedOrigin, rpName };
}

export {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
};
