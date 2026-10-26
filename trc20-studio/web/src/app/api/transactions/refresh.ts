import { prisma } from "@/lib/db";
import { getReceipt } from "@/lib/tron-server";

export async function refreshTx(id: string, sessionAddress: string) {
  const t = await prisma.txRecord.findUniqueOrThrow({ where: { id } });
  if (t.status !== "PENDING") return t;
  const r = await getReceipt(t.network, t.txHash);
  if (r.ownerAddress && r.ownerAddress !== sessionAddress) {
    return prisma.txRecord.update({ where: { id }, data: { status: "FAILED", failureReason: "Not sent by your wallet" } });
  }
  if (r.state === "pending") return t;
  return prisma.txRecord.update({
    where: { id },
    data: {
      status: r.state === "confirmed" ? "CONFIRMED" : "FAILED",
      failureReason: r.failureReason,
      feeSun: r.feeSun,
      blockNumber: r.blockNumber,
      confirmedAt: r.state === "confirmed" ? new Date() : null,
    },
  });
}
