import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUserById } from "@/lib/repo/user";
import { listUserPasskeys, savePasskeyChallenge } from "@/lib/repo/passkey";
import { generateRegistrationOptions, getRpConfig } from "@/lib/passkey";

export async function POST() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await findUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userPasskeys = await listUserPasskeys(user.id);
    const { rpID, rpName } = getRpConfig();

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: user.email || user.phone || `user-${user.id.slice(0, 6)}`,
      userDisplayName: user.name || "BizNet Trader",
      attestationType: "none",
      excludeCredentials: userPasskeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports as any,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    session.passkeyChallenge = options.challenge;
    await session.save();

    await savePasskeyChallenge(options.challenge, user.id);

    return NextResponse.json(options);
  } catch (err: any) {
    console.error("Passkey generate registration error:", err);
    return NextResponse.json(
      { error: "Failed to generate passkey registration options" },
      { status: 500 }
    );
  }
}
