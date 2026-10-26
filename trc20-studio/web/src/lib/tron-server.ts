import "server-only";
import { TronWeb } from "tronweb";
import { NETWORKS, type NetworkId } from "./networks";
import artifact from "@/contracts/StudioTRC20.json";

const clients = new Map<NetworkId, TronWeb>();

export function serverTron(network: NetworkId): TronWeb {
  let tw = clients.get(network);
  if (!tw) {
    const headers: Record<string, string> = {};
    if (process.env.TRONGRID_API_KEY && network === "mainnet") headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
    tw = new TronWeb({ fullHost: NETWORKS[network].fullHost, headers });
    // Read-only calls need *some* caller address; this one never signs anything.
    tw.setAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
    clients.set(network, tw);
  }
  return tw;
}

/** Returns the base58 address that produced `signature` over `message` (TIP-191 style signMessageV2). */
export async function recoverSigner(message: string, signature: string): Promise<string> {
  const tw = serverTron("mainnet");
  return (await tw.trx.verifyMessageV2(message, signature)) as string;
}

export interface ChainReceipt {
  state: "pending" | "confirmed" | "failed";
  ownerAddress?: string;
  contractAddress?: string;
  feeSun?: bigint;
  energyUsed?: bigint;
  blockNumber?: bigint;
  failureReason?: string;
}

function hexToUtf8(hex?: string) {
  if (!hex) return undefined;
  try { return Buffer.from(hex, "hex").toString("utf8"); } catch { return hex; }
}

/**
 * Asks the network for the transaction and its execution receipt.
 * Only a receipt included in a block counts as confirmed — we never trust the client.
 */
export async function getReceipt(network: NetworkId, hash: string): Promise<ChainReceipt> {
  const tw = serverTron(network);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tx, info]: [any, any] = await Promise.all([
    tw.trx.getTransaction(hash).catch(() => null),
    tw.trx.getTransactionInfo(hash).catch(() => null),
  ]);
  if (!tx || !tx.raw_data) return { state: "pending" };

  const ownerHex: string | undefined = tx.raw_data.contract?.[0]?.parameter?.value?.owner_address;
  const ownerAddress = ownerHex ? TronWeb.address.fromHex(ownerHex) : undefined;

  if (!info || !info.blockNumber) return { state: "pending", ownerAddress };

  const receiptResult: string | undefined = info.receipt?.result;
  const contractRet: string | undefined = tx.ret?.[0]?.contractRet;
  const failed = info.result === "FAILED" || (receiptResult && receiptResult !== "SUCCESS") || (contractRet && contractRet !== "SUCCESS");

  return {
    state: failed ? "failed" : "confirmed",
    ownerAddress,
    contractAddress: info.contract_address ? TronWeb.address.fromHex(info.contract_address) : undefined,
    feeSun: BigInt(info.fee ?? 0),
    energyUsed: BigInt(info.receipt?.energy_usage_total ?? 0),
    blockNumber: BigInt(info.blockNumber),
    failureReason: failed ? hexToUtf8(info.resMessage) || receiptResult || contractRet || "Execution failed" : undefined,
  };
}

/** Reads metadata straight from a deployed StudioTRC20 to confirm it matches what was submitted. */
export async function readTokenMeta(network: NetworkId, address: string) {
  const tw = serverTron(network);
  const c = await tw.contract(artifact.abi as never, address);
  const [name, symbol, decimals, totalSupply, mintable] = await Promise.all([
    c.name().call(), c.symbol().call(), c.decimals().call(), c.totalSupply().call(), c.mintable().call(),
  ]);
  return {
    name: String(name),
    symbol: String(symbol),
    decimals: Number(decimals),
    totalSupply: BigInt(totalSupply.toString()),
    mintable: Boolean(mintable),
  };
}
