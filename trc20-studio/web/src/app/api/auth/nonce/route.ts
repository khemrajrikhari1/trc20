import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { tronAddress } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "nonce"), 20)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const parsed = tronAddress.safeParse(body.address);
  if (!parsed.success) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

  const nonce = randomBytes(16).toString("hex");
  const issued = new Date();
  // Bind the message to the exact origin the user is on (prevents reuse on other sites).
  const app = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const message = [
    `${new URL(app).host} wants you to sign in with your TRON wallet.`,
    "",
    "Signing proves you own this address. It costs nothing and does not send a transaction.",
    "",
    `Address: ${parsed.data}`,
    `URI: ${app}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issued.toISOString()}`,
  ].join("\n");

  await prisma.authNonce.create({
    data: { address: parsed.data, nonce, message, expiresAt: new Date(issued.getTime() + 5 * 60_000) },
  });
  return NextResponse.json({ message, nonce });
}
