import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  findAndConsumePasskeyChallenge,
  findPasskeyByCredentialId,
  updatePasskeyCounter,
} from "@/lib/repo/passkey";
import { verifyAuthenticationResponse, getRpConfig } from "@/lib/passkey";
import { AuthenticationResponseJSON } from "@simplewebauthn/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body: { response: AuthenticationResponseJSON; challenge: string } =
      await req.json();

    if (!session.passkeyChallenge || session.passkeyChallenge !== body.challenge) {
      return NextResponse.json(
        { error: "Challenge does not match active session" },
        { status: 400 }
      );
    }
    session.passkeyChallenge = undefined;

    const challengeResult = await findAndConsumePasskeyChallenge(body.challenge);
    if (!challengeResult.valid) {
      return NextResponse.json(
        { error: "Invalid or expired login challenge" },
        { status: 400 }
      );
    }

    const passkey = await findPasskeyByCredentialId(body.response.id);
    if (!passkey || !passkey.user || passkey.user.deletedAt !== null) {
      return NextResponse.json(
        { error: "Passkey credential not recognized or user disabled" },
        { status: 400 }
      );
    }

    const { rpID, expectedOrigin } = getRpConfig();

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: body.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: Number(passkey.counter),
        transports: passkey.transports as any,
      },
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json(
        { error: "Passkey biometric verification failed" },
        { status: 400 }
      );
    }

    // Update counter
    await updatePasskeyCounter(
      passkey.id,
      BigInt(verification.authenticationInfo.newCounter)
    );

    // Establish iron-session
    const user = passkey.user;
    const primaryMembership = user.memberships?.[0];
    const activeBusinessId = user.activeBusinessId || primaryMembership?.businessId;

    session.userId = user.id;
    session.phone = user.phone || undefined;
    session.email = user.email || undefined;
    session.authMethod = "PASSKEY";
    session.role = user.role;
    session.activeBusinessId = activeBusinessId;
    session.businessRole = primaryMembership?.role;
    session.isLoggedIn = true;
    await session.save();

    const hasBusiness = !!activeBusinessId;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
      },
      isNewUser: false,
      hasBusiness,
    });
  } catch (err: any) {
    console.error("Passkey verify authentication error:", err);
    return NextResponse.json(
      { error: "Passkey biometric authentication failed" },
      { status: 500 }
    );
  }
}
