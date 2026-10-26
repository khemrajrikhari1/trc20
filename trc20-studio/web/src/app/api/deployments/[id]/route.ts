import { NextResponse } from "next/server";
import { prisma, serialize } from "@/lib/db";
import { requireUser } from "../../_guard";
import { refreshDeployment } from "../refresh";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const d = await prisma.deployment.findUnique({ where: { id: params.id } });
  if (!d || d.userId !== g.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const fresh = await refreshDeployment(d.id, g.user.address);
  return NextResponse.json(serialize(fresh));
}
