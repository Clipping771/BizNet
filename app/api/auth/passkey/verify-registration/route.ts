import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createPasskey, findAndConsumePasskeyChallenge } from "@/lib/repo/passkey";
import { verifyRegistrationResponse, getRpConfig } from "@/lib/passkey";
import { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: { response: RegistrationResponseJSON; challenge: string; name?: string } =
      await req.json();

    if (!session.passkeyChallenge || session.passkeyChallenge !== body.challenge) {
      return NextResponse.json(
        { error: "Challenge does not match active session" },
        { status: 400 }
      );
    }
    session.passkeyChallenge = undefined;
    await session.save();

    const challengeResult = await findAndConsumePasskeyChallenge(body.challenge);
    if (!challengeResult.valid || challengeResult.userId !== session.userId) {
      return NextResponse.json(
        { error: "Invalid or expired registration challenge" },
        { status: 400 }
      );
    }

    const { rpID, expectedOrigin } = getRpConfig();

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: body.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Passkey biometric verification failed" },
        { status: 400 }
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Save Passkey in DB
    const passkey = await createPasskey({
      userId: session.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports,
      name: body.name || "My Passkey",
    });

    return NextResponse.json({
      success: true,
      passkeyId: passkey.id,
      name: passkey.name,
      message: "Passkey registered successfully",
    });
  } catch (err: any) {
    console.error("Passkey verify registration error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while saving passkey" },
      { status: 500 }
    );
  }
}
