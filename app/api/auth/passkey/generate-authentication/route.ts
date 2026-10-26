import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { savePasskeyChallenge } from "@/lib/repo/passkey";
import { generateAuthenticationOptions, getRpConfig } from "@/lib/passkey";

export async function POST() {
  try {
    const { rpID } = getRpConfig();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });

    const session = await getSession();
    session.passkeyChallenge = options.challenge;
    await session.save();

    await savePasskeyChallenge(options.challenge);

    return NextResponse.json(options);
  } catch (err: any) {
    console.error("Passkey generate authentication error:", err);
    return NextResponse.json(
      { error: "Failed to generate passkey authentication options" },
      { status: 500 }
    );
  }
}
