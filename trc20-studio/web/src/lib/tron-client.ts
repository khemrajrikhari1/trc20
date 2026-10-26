"use client";
// Browser-side helpers. All signing happens inside the user's wallet (TronLink).
// This app never sees, asks for, or stores private keys or seed phrases.

import artifact from "@/contracts/StudioTRC20.json";
import { networkFromHost, type NetworkId } from "./networks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTronWeb = any;

declare global {
  interface Window {
    tronWeb?: AnyTronWeb;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tronLink?: { request: (a: { method: string }) => Promise<any>; tronWeb?: AnyTronWeb; ready?: boolean };
  }
}

export function injected(): AnyTronWeb | null {
  if (typeof window === "undefined") return null;
  return window.tronLink?.tronWeb || window.tronWeb || null;
}

export function walletInstalled() {
  return typeof window !== "undefined" && (!!window.tronLink || !!window.tronWeb);
}

export async function requestConnection(): Promise<void> {
  if (!window.tronLink) throw new Error("TronLink is not installed. Install it from tronlink.org, then reload.");
  const res = await window.tronLink.request({ method: "tron_requestAccounts" });
  // TronLink returns {code:200} on approve, {code:4001} on reject, or "" if locked.
  if (res && typeof res === "object" && res.code && res.code !== 200) {
    throw new Error(res.code === 4001 ? "Connection was declined in TronLink." : res.message || "TronLink refused the connection.");
  }
  if (!res) throw new Error("Unlock TronLink, then try again.");
}

export function currentAccount(): { address: string | null; network: NetworkId | null; host: string | null } {
  const tw = injected();
  const address = tw?.defaultAddress?.base58 || null;
  const host: string | null = tw?.fullNode?.host || null;
  return { address: address || null, network: networkFromHost(host), host };
}

export async function trxBalanceSun(address: string): Promise<bigint> {
  const tw = injected();
  if (!tw) throw new Error("Wallet not available");
  return BigInt(await tw.trx.getBalance(address));
}

export async function signLogin(message: string): Promise<string> {
  const tw = injected();
  if (!tw) throw new Error("Wallet not available");
  return tw.trx.signMessageV2(message);
}

/** Current price of 1 unit of energy in sun, from on-chain parameters. */
export async function energyPriceSun(): Promise<bigint> {
  const tw = injected();
  const params: { key: string; value?: number }[] = await tw.trx.getChainParameters();
  const p = params.find((x) => x.key === "getEnergyFee");
  return BigInt(p?.value ?? 420);
}

/** Energy the wallet can spend for free right now (staked/delegated). */
export async function availableEnergy(address: string): Promise<bigint> {
  const tw = injected();
  const r = await tw.trx.getAccountResources(address);
  return BigInt((r.EnergyLimit ?? 0) - (r.EnergyUsed ?? 0));
}

/**
 * Deployment energy can't be simulated before the contract exists, so this is an
 * estimate from bytecode size + constructor work. The fee limit is the hard ceiling.
 */
export function estimateDeployEnergy(): bigint {
  const bytes = BigInt(artifact.bytecode.length / 2);
  return bytes * 200n + 120_000n;
}

export const DEPLOY_FEE_LIMIT_SUN = 1_000_000_000n; // 1,000 TRX hard ceiling — actual cost is far lower
export const TRANSFER_FEE_LIMIT_SUN = 100_000_000n; // 100 TRX ceiling

export interface DeployArgs {
  name: string;
  symbol: string;
  decimals: number;
  supplyBase: bigint;
  mintable: boolean;
  capBase: bigint;
}

/** Builds the deployment, asks the wallet to sign it, broadcasts. Returns the tx hash. */
export async function deployToken(owner: string, a: DeployArgs): Promise<{ txHash: string }> {
  const tw = injected();
  if (!tw) throw new Error("Wallet not available");
  const tx = await tw.transactionBuilder.createSmartContract(
    {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit: Number(DEPLOY_FEE_LIMIT_SUN),
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      name: "StudioTRC20",
      parameters: [a.name, a.symbol, a.decimals, a.supplyBase.toString(), a.mintable, a.capBase.toString()],
    },
    tw.address.toHex(owner),
  );
  const signed = await tw.trx.sign(tx); // TronLink shows its own approval screen here
  const res = await tw.trx.sendRawTransaction(signed);
  if (!res?.result) throw new Error(decodeBroadcastError(res));
  return { txHash: signed.txID as string };
}

const TRANSFER_SIG = "transfer(address,uint256)";

/** Simulates a TRC20 transfer to get a real energy figure for the fee estimate. */
export async function estimateTransferEnergy(owner: string, token: string, to: string, amountBase: bigint): Promise<bigint> {
  const tw = injected();
  const r = await tw.transactionBuilder.triggerConstantContract(
    tw.address.toHex(token), TRANSFER_SIG, {},
    [{ type: "address", value: to }, { type: "uint256", value: amountBase.toString() }],
    tw.address.toHex(owner),
  );
  if (r?.result?.result === false || r?.transaction?.ret?.[0]?.ret === "FAILED") {
    throw new Error("This transfer would fail on-chain (check balance and address).");
  }
  return BigInt(r?.energy_used ?? 0);
}

export async function sendTrc20(owner: string, token: string, to: string, amountBase: bigint): Promise<{ txHash: string }> {
  const tw = injected();
  const { transaction } = await tw.transactionBuilder.triggerSmartContract(
    tw.address.toHex(token), TRANSFER_SIG,
    { feeLimit: Number(TRANSFER_FEE_LIMIT_SUN), callValue: 0 },
    [{ type: "address", value: to }, { type: "uint256", value: amountBase.toString() }],
    tw.address.toHex(owner),
  );
  const signed = await tw.trx.sign(transaction);
  const res = await tw.trx.sendRawTransaction(signed);
  if (!res?.result) throw new Error(decodeBroadcastError(res));
  return { txHash: signed.txID as string };
}

export async function sendTrx(owner: string, to: string, sun: bigint): Promise<{ txHash: string }> {
  const tw = injected();
  const tx = await tw.transactionBuilder.sendTrx(to, Number(sun), owner);
  const signed = await tw.trx.sign(tx);
  const res = await tw.trx.sendRawTransaction(signed);
  if (!res?.result) throw new Error(decodeBroadcastError(res));
  return { txHash: signed.txID as string };
}

export async function readTrc20(token: string, holder: string) {
  const tw = injected();
  const c = await tw.contract().at(token);
  const [name, symbol, decimals, balance] = await Promise.all([
    c.name().call().catch(() => "Unknown"),
    c.symbol().call().catch(() => "?"),
    c.decimals().call().catch(() => 0),
    c.balanceOf(holder).call(),
  ]);
  return { name: String(name), symbol: String(symbol), decimals: Number(decimals), balance: BigInt(balance.toString()) };
}

export function isValidAddress(a: string) {
  const tw = injected();
  return tw ? tw.isAddress(a) : /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeBroadcastError(res: any): string {
  const raw = res?.message || res?.code || "Broadcast failed";
  if (typeof raw === "string" && /^[0-9a-f]+$/i.test(raw)) {
    try {
      return new TextDecoder().decode(new Uint8Array(raw.match(/.{2}/g)!.map((b) => parseInt(b, 16))));
    } catch { /* fall through */ }
  }
  return String(raw);
}

/** Polls the connected node until the tx is in a block. Resolves "confirmed" or "failed" — never assumes success. */
export async function waitForReceipt(hash: string, timeoutMs = 90_000): Promise<{ state: "confirmed" | "failed" | "timeout"; reason?: string }> {
  const tw = injected();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const info = await tw.trx.getTransactionInfo(hash).catch(() => null);
    if (info?.blockNumber) {
      const ok = info.result !== "FAILED" && (!info.receipt?.result || info.receipt.result === "SUCCESS");
      return ok ? { state: "confirmed" } : { state: "failed", reason: info.receipt?.result || "Execution failed" };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { state: "timeout" };
}

/** Owner-only calls on a StudioTRC20. The contract itself rejects anyone else. */
export async function ownerCall(owner: string, token: string, fn: "mint" | "renounceOwnership", args: { type: string; value: string }[] = []) {
  const tw = injected();
  const sig = fn === "mint" ? "mint(address,uint256)" : "renounceOwnership()";
  const { transaction } = await tw.transactionBuilder.triggerSmartContract(
    tw.address.toHex(token), sig, { feeLimit: Number(TRANSFER_FEE_LIMIT_SUN), callValue: 0 }, args, tw.address.toHex(owner),
  );
  const signed = await tw.trx.sign(transaction);
  const res = await tw.trx.sendRawTransaction(signed);
  if (!res?.result) throw new Error(decodeBroadcastError(res));
  return { txHash: signed.txID as string };
}

/** Extra StudioTRC20 views; returns nulls for tokens that aren't StudioTRC20. */
export async function readStudioMeta(token: string) {
  const tw = injected();
  const c = await tw.contract(artifact.abi, token);
  const safe = async <T,>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  const [totalSupply, mintable, owner, cap, deployedAsMintable] = await Promise.all([
    safe(c.totalSupply().call()), safe(c.mintable().call()), safe(c.owner().call()), safe(c.cap().call()), safe(c.deployedAsMintable().call()),
  ]);
  return {
    totalSupply: totalSupply !== null ? BigInt(String(totalSupply)) : null,
    isStudio: deployedAsMintable !== null,
    mintable: mintable === null ? null : Boolean(mintable),
    owner: owner ? tw.address.fromHex(String(owner)) : null,
    cap: cap !== null ? BigInt(String(cap)) : null,
  };
}

/**
 * Estimates the cost of a plain TRX transfer.
 * A transfer uses ~270 bytes of bandwidth; free daily bandwidth covers it, otherwise it's burned as TRX.
 * Sending to a never-used address also activates it, which costs an extra fee.
 */
export async function estimateTrxTransfer(owner: string, to: string) {
  const tw = injected();
  const [res, params, target] = await Promise.all([
    tw.trx.getAccountResources(owner),
    tw.trx.getChainParameters() as Promise<{ key: string; value?: number }[]>,
    tw.trx.getAccount(to).catch(() => ({})),
  ]);
  const p = (k: string, d: number) => BigInt(params.find((x) => x.key === k)?.value ?? d);
  const bytes = 270n;
  const freeBw = BigInt((res.freeNetLimit ?? 0) - (res.freeNetUsed ?? 0)) + BigInt((res.NetLimit ?? 0) - (res.NetUsed ?? 0));
  const bandwidthSun = freeBw >= bytes ? 0n : bytes * p("getTransactionFee", 1000);
  const recipientActive = !!target && Object.keys(target).length > 0;
  const activationSun = recipientActive ? 0n : p("getCreateNewAccountFeeInSystemContract", 1_000_000) + p("getCreateAccountFee", 100_000);
  return { bandwidthSun, activationSun, totalSun: bandwidthSun + activationSun, recipientActive };
}
