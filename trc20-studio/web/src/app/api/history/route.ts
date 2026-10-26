import { NextResponse } from "next/server";
import { NETWORKS } from "@/lib/networks";
import { networkId, tronAddress } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Proxies TronGrid's indexed history so the API key stays server-side.
 * Returns confirmed on-chain TRC20 transfers + TRC20 balances for an address.
 */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "history"), 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const addr = tronAddress.safeParse(sp.get("address"));
  const net = networkId.safeParse(sp.get("network"));
  if (!addr.success || !net.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const base = NETWORKS[net.data].fullHost;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.TRONGRID_API_KEY && net.data === "mainnet") headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;

  const [txRes, accRes] = await Promise.all([
    fetch(`${base}/v1/accounts/${addr.data}/transactions/trc20?limit=50&only_confirmed=true`, { headers, cache: "no-store" }),
    fetch(`${base}/v1/accounts/${addr.data}`, { headers, cache: "no-store" }),
  ]);
  const tx = txRes.ok ? await txRes.json() : { data: [] };
  const acc = accRes.ok ? await accRes.json() : { data: [] };

  // TronGrid returns trc20 balances as [{ contractAddress: "rawBalance" }, ...]
  const trc20: { contract: string; raw: string }[] = (acc.data?.[0]?.trc20 ?? []).flatMap((o: Record<string, string>) =>
    Object.entries(o).map(([contract, raw]) => ({ contract, raw })),
  );

  return NextResponse.json({
    transfers: (tx.data ?? []).map((t: Record<string, unknown> & { token_info?: Record<string, unknown> }) => ({
      txHash: t.transaction_id,
      from: t.from,
      to: t.to,
      value: t.value,
      type: t.type,
      timestamp: t.block_timestamp,
      token: { address: t.token_info?.address, symbol: t.token_info?.symbol, name: t.token_info?.name, decimals: t.token_info?.decimals },
    })),
    trc20,
  });
}
