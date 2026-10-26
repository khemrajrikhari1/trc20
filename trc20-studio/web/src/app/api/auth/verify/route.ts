import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { recoverSigner } from "@/lib/tron-server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const Body = z.object({ nonce: z.string().length(32), signature: z.string().min(10).max(200) });

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "verify"), 20)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const record = await prisma.authNonce.findUnique({ where: { nonce: parsed.data.nonce } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Sign-in request expired. Try again." }, { status: 401 });
  }
  // Burn the nonce first so a signature can never be replayed.
  await prisma.authNonce.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  let signer: string;
  try {
    signer = await recoverSigner(record.message, parsed.data.signature);
  } catch {
    return NextResponse.json({ error: "Signature could not be verified" }, { status: 401 });
  }
  if (signer !== record.address) return NextResponse.json({ error: "Signature does not match this address" }, { status: 401 });

  await prisma.user.upsert({
    where: { address: signer },
    create: { address: signer },
    update: { lastLoginAt: new Date() },
  });
  await createSession(signer);
  return NextResponse.json({ address: signer });
}
