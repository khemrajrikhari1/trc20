import { NextResponse } from "next/server";
import { prisma, serialize } from "@/lib/db";
import { requireUser } from "../../_guard";
import { refreshTx } from "../refresh";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const t = await prisma.txRecord.findUnique({ where: { id: params.id } });
  if (!t || t.userId !== g.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serialize(await refreshTx(t.id, g.user.address)));
}
