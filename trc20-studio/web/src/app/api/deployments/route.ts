import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, serialize } from "@/lib/db";
import { networkId, tokenFormSchema, txHash } from "@/lib/validation";
import { enabledNetworks } from "@/lib/networks";
import artifact from "@/contracts/StudioTRC20.json";
import { requireUser } from "../_guard";
import { refreshDeployment } from "./refresh";

export async function GET(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const network = new URL(req.url).searchParams.get("network");
  const rows = await prisma.deployment.findMany({
    where: { userId: g.user.id, ...(network && networkId.safeParse(network).success ? { network: network as never } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(serialize(rows));
}

const Body = z.object({ network: networkId, txHash, form: tokenFormSchema });

/** Records a deployment the user already broadcast, then checks the chain for its receipt. */
export async function POST(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  const { network, txHash: hash, form } = parsed.data;
  if (!enabledNetworks().includes(network)) return NextResponse.json({ error: "Network not enabled" }, { status: 400 });

  const existing = await prisma.deployment.findUnique({ where: { txHash: hash } });
  if (existing) return NextResponse.json({ error: "Already recorded" }, { status: 409 });

  const row = await prisma.deployment.create({
    data: {
      userId: g.user.id,
      network,
      name: form.name,
      symbol: form.symbol.toUpperCase(),
      decimals: form.decimals,
      initialSupply: form.initialSupply,
      mintable: form.mintable,
      cap: form.mintable && form.cap ? form.cap : "0",
      description: form.description || null,
      website: form.website || null,
      logoUrl: form.logoUrl || null,
      txHash: hash,
      bytecodeSha256: artifact.bytecodeSha256,
    },
  });
  const updated = await refreshDeployment(row.id, g.user.address);
  return NextResponse.json(serialize(updated), { status: 201 });
}
