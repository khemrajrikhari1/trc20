import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function requireUser() {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: "Sign in with your wallet first" }, { status: 401 }) } as const;
  const user = await prisma.user.findUnique({ where: { address: s.address } });
  if (!user) return { error: NextResponse.json({ error: "Session no longer valid" }, { status: 401 }) } as const;
  return { user } as const;
}
