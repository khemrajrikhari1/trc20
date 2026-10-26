import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, serialize } from "@/lib/db";
import { networkId, tronAddress, txHash } from "@/lib/validation";
import { requireUser } from "../_guard";
import { refreshTx } from "./refresh";

export async function GET(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const network = new URL(req.url).searchParams.get("network");
  const rows = await prisma.txRecord.findMany({
    where: { userId: g.user.id, ...(network && networkId.safeParse(network).success ? { network: network as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(serialize(rows));
}

const Body = z.object({
  network: networkId,
  txHash,
  kind: z.enum(["trc20_transfer", "trx_transfer"]),
  toAddress: tronAddress,
  tokenAddress: tronAddress.optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  symbol: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const b = parsed.data;
  const row = await prisma.txRecord.upsert({
    where: { txHash: b.txHash },
    create: { ...b, userId: g.user.id, fromAddress: g.user.address },
    update: {},
  });
  if (row.userId !== g.user.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  return NextResponse.json(serialize(await refreshTx(row.id, g.user.address)), { status: 201 });
}
