import { prisma } from "@/lib/db";
import { getReceipt, readTokenMeta } from "@/lib/tron-server";
import { toBaseUnits } from "@/lib/units";

/**
 * Re-checks a pending deployment against the chain. It becomes CONFIRMED only when:
 *  - the tx is in a block with a SUCCESS receipt,
 *  - it was sent by the signed-in wallet,
 *  - the new contract reports the exact name/symbol/decimals/supply that were recorded.
 */
export async function refreshDeployment(id: string, sessionAddress: string) {
  const d = await prisma.deployment.findUniqueOrThrow({ where: { id } });
  if (d.status !== "PENDING") return d;

  const r = await getReceipt(d.network, d.txHash);
  if (r.ownerAddress && r.ownerAddress !== sessionAddress) {
    return prisma.deployment.update({ where: { id }, data: { status: "FAILED", failureReason: "Transaction was not sent by your wallet" } });
  }
  if (r.state === "pending") return d;
  if (r.state === "failed" || !r.contractAddress) {
    return prisma.deployment.update({
      where: { id },
      data: { status: "FAILED", failureReason: r.failureReason ?? "No contract created", feeSun: r.feeSun, energyUsed: r.energyUsed, blockNumber: r.blockNumber },
    });
  }

  let mismatch: string | null = null;
  try {
    const meta = await readTokenMeta(d.network, r.contractAddress);
    const expectedSupply = toBaseUnits(d.initialSupply, d.decimals);
    if (meta.name !== d.name || meta.symbol.toUpperCase() !== d.symbol || meta.decimals !== d.decimals || meta.totalSupply !== expectedSupply || meta.mintable !== d.mintable) {
      mismatch = "On-chain token details do not match the submitted form";
    }
  } catch {
    // Node may lag a block behind the receipt; leave PENDING and retry on next refresh.
    return d;
  }

  return prisma.deployment.update({
    where: { id },
    data: {
      status: mismatch ? "FAILED" : "CONFIRMED",
      failureReason: mismatch,
      contractAddress: r.contractAddress,
      feeSun: r.feeSun,
      energyUsed: r.energyUsed,
      blockNumber: r.blockNumber,
      confirmedAt: mismatch ? null : new Date(),
    },
  });
}
