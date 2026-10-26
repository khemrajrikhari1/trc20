"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { Gate } from "@/components/shell";
import { Button, Dialog, ExplorerLink, Field, Hash, Notice, Panel, Row, StatusPill, inputCls } from "@/components/ui";
import { NETWORKS, OFFICIAL_USDT_MAINNET } from "@/lib/networks";
import { fromBaseUnits, sunToTrx, toBaseUnits } from "@/lib/units";
import {
  TRANSFER_FEE_LIMIT_SUN, energyPriceSun, availableEnergy, estimateTransferEnergy, isValidAddress,
  ownerCall, readStudioMeta, readTrc20, sendTrc20, waitForReceipt,
} from "@/lib/tron-client";
import { usePollPending } from "@/lib/use-poll";
import type { TxRow } from "@/lib/types";

type Meta = Awaited<ReturnType<typeof readTrc20>> & Awaited<ReturnType<typeof readStudioMeta>>;

export default function TokenPage({ params }: { params: { address: string } }) {
  return (
    <div className="max-w-4xl space-y-6">
      <Gate><TokenDetail address={params.address} /></Gate>
    </div>
  );
}

function TokenDetail({ address }: { address: string }) {
  const w = useWallet();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (!isValidAddress(address)) throw new Error("That isn't a valid TRON contract address.");
      const [a, b] = await Promise.all([readTrc20(address, w.address!), readStudioMeta(address)]);
      setMeta({ ...a, ...b }); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read this contract on the current network."); }
  }, [address, w.address]);
  useEffect(() => { load(); }, [load, w.network]);

  if (err) return <Notice tone="bad">{err}</Notice>;
  if (!meta) return <p className="text-sm text-muted">Reading the contract…</p>;

  const isOwner = !!meta.owner && meta.owner === w.address;
  const officialUsdt = w.network === "mainnet" && address === OFFICIAL_USDT_MAINNET;
  const lookalike = !officialUsdt && /^U[S$5]D[T7]/i.test(meta.symbol);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{meta.name} <span className="text-muted font-normal">{meta.symbol}</span></h1>
        <div className="mt-1 flex flex-wrap items-center gap-3"><Hash value={address} head={10} tail={8} /><ExplorerLink network={w.network!} kind="contract" value={address} /></div>
      </div>

      {lookalike && <Notice tone="bad">This contract calls itself {meta.symbol} but it is not Tether&apos;s official USDT contract. Treat it as an unknown token.</Notice>}
      {officialUsdt && <Notice tone="ok">This is Tether&apos;s official USDT contract on TRON mainnet.</Notice>}

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Details">
          <dl>
            <Row k="Your balance" v={<span className="figures font-medium">{fromBaseUnits(meta.balance, meta.decimals)}</span>} />
            {meta.totalSupply !== null && <Row k="Total supply" v={<span className="figures">{fromBaseUnits(meta.totalSupply, meta.decimals)}</span>} />}
            <Row k="Decimals" v={meta.decimals} />
            <Row k="Supply model" v={!meta.isStudio ? "Unknown (not created with this app)" : meta.mintable ? (meta.cap ? `Mintable up to ${fromBaseUnits(meta.cap, meta.decimals)}` : "Mintable, no cap") : "Fixed — no more can be created"} />
            {meta.isStudio && <Row k="Owner" v={meta.owner ? <Hash value={meta.owner} /> : "None"} />}
          </dl>
        </Panel>
        <TransferPanel token={address} symbol={meta.symbol} decimals={meta.decimals} balance={meta.balance} onDone={load} />
      </div>

      {isOwner && meta.mintable && <OwnerPanel token={address} symbol={meta.symbol} decimals={meta.decimals} cap={meta.cap} supply={meta.totalSupply} onDone={load} />}
    </>
  );
}

function TransferPanel({ token, symbol, decimals, balance, onDone }: { token: string; symbol: string; decimals: number; balance: bigint; onDone: () => void }) {
  const w = useWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ amountBase: bigint; energy: bigint; costSun: bigint } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<TxRow | null>(null);
  usePollPending(tx ? [tx] : [], (id) => `/api/transactions/${id}`, (u) => { setTx(u); if (u.status !== "PENDING") onDone(); });

  const review = async () => {
    setErr(null);
    try {
      if (!isValidAddress(to)) throw new Error("Enter a valid TRON address starting with T.");
      if (to === w.address) throw new Error("That's your own address.");
      const amountBase = toBaseUnits(amount, decimals);
      if (amountBase <= 0n) throw new Error("Amount must be more than 0.");
      if (amountBase > balance) throw new Error("That's more than your balance.");
      const [energy, price, free] = await Promise.all([estimateTransferEnergy(w.address!, token, to, amountBase), energyPriceSun(), availableEnergy(w.address!)]);
      setQuote({ amountBase, energy, costSun: (energy > free ? energy - free : 0n) * price });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const send = async () => {
    if (!quote) return;
    setBusy(true); setErr(null);
    try {
      const { txHash } = await sendTrc20(w.address!, token, to, quote.amountBase);
      const r = await fetch("/api/transactions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: w.network, txHash, kind: "trc20_transfer", toAddress: to, tokenAddress: token, amount, symbol }),
      });
      setTx(await r.json());
      setQuote(null); setAmount("");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/cancel|declin|reject/i.test(m) ? "You declined in TronLink. Nothing was sent." : m);
      setQuote(null);
    } finally { setBusy(false); }
  };

  return (
    <Panel title={`Send ${symbol}`}>
      <div className="space-y-4">
        <Field label="Recipient address" htmlFor="to"><input id="to" className={`${inputCls} font-mono text-[13px]`} value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="T…" autoComplete="off" /></Field>
        <Field label="Amount" htmlFor="amt" hint={`Available: ${fromBaseUnits(balance, decimals)} ${symbol}`}>
          <input id="amt" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button onClick={review} disabled={!to || !amount}>Review transfer</Button>
        {tx && (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="text-sm"><p>{tx.amount} {tx.symbol} to <Hash value={tx.toAddress} /></p><ExplorerLink network={tx.network} kind="tx" value={tx.txHash} /></div>
            <StatusPill status={tx.status} />
          </div>
        )}
      </div>

      <Dialog open={!!quote} onClose={() => !busy && setQuote(null)} title="Confirm transfer">
        {quote && (
          <>
            <dl>
              <Row k="Send" v={<span className="figures font-medium">{amount} {symbol}</span>} />
              <Row k="To" v={<span className="font-mono text-[13px] break-all">{to}</span>} />
              <Row k="Network" v={NETWORKS[w.network!].label} />
              <Row k="Energy (simulated)" v={<span className="figures">{quote.energy.toLocaleString()}</span>} />
              <Row k="Estimated fee" v={<span className="figures">≈ {sunToTrx(quote.costSun, 3)} TRX</span>} />
              <Row k="Fee limit" v={<span className="figures">{sunToTrx(TRANSFER_FEE_LIMIT_SUN, 0)} TRX</span>} />
            </dl>
            <Notice tone="warn">Blockchain transfers can&apos;t be reversed. Double-check the address.</Notice>
            <div className="flex justify-end gap-3">
              <Button variant="quiet" onClick={() => setQuote(null)} disabled={busy}>Cancel</Button>
              <Button onClick={send} busy={busy}>Send {symbol}</Button>
            </div>
          </>
        )}
      </Dialog>
    </Panel>
  );
}

function OwnerPanel({ token, symbol, decimals, cap, supply, onDone }: { token: string; symbol: string; decimals: number; cap: bigint | null; supply: bigint | null; onDone: () => void }) {
  const w = useWallet();
  const [to, setTo] = useState(w.address ?? "");
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState<null | "mint" | "renounce">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string; hash?: string } | null>(null);

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const { txHash } = confirm === "mint"
        ? await ownerCall(w.address!, token, "mint", [{ type: "address", value: to }, { type: "uint256", value: toBaseUnits(amount, decimals).toString() }])
        : await ownerCall(w.address!, token, "renounceOwnership");
      setConfirm(null);
      setMsg({ tone: "info", text: "Broadcast. Waiting for confirmation…", hash: txHash });
      const r = await waitForReceipt(txHash);
      setMsg(r.state === "confirmed" ? { tone: "ok", text: "Confirmed on-chain.", hash: txHash }
        : r.state === "failed" ? { tone: "bad", text: `Failed on-chain: ${r.reason}`, hash: txHash }
        : { tone: "info", text: "Still not in a block. Check TRONSCAN.", hash: txHash });
      onDone();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
      setConfirm(null);
    } finally { setBusy(false); }
  };

  const remaining = cap && supply !== null ? cap - supply : null;

  return (
    <Panel title="Owner controls">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Mint to" htmlFor="mto"><input id="mto" className={`${inputCls} font-mono text-[13px]`} value={to} onChange={(e) => setTo(e.target.value.trim())} /></Field>
          <Field label="Amount" htmlFor="mamt" hint={remaining !== null ? `Up to ${fromBaseUnits(remaining, decimals)} more under the cap` : "No cap"}>
            <input id="mamt" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Button onClick={() => setConfirm("mint")} disabled={!amount || !isValidAddress(to)}>Review mint</Button>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-medium text-[15px]">Give up minting forever</p>
          <p className="text-muted">Renouncing ownership turns this into a fixed-supply token. Holders can verify it on-chain. This can&apos;t be reversed.</p>
          <Button variant="danger" onClick={() => setConfirm("renounce")}>Renounce ownership</Button>
        </div>
      </div>
      {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text} {msg.hash && <ExplorerLink network={w.network!} kind="tx" value={msg.hash} />}</Notice></div>}

      <Dialog open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm === "mint" ? "Confirm mint" : "Renounce ownership?"}>
        <p className="text-[15px]">
          {confirm === "mint" ? `Create ${amount} new ${symbol} and send them to ${to}. Total supply goes up by this amount.`
            : `After this, nobody can ever mint ${symbol} again — including you.`}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="quiet" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
          <Button variant={confirm === "renounce" ? "danger" : "primary"} onClick={run} busy={busy}>{confirm === "mint" ? `Mint ${symbol}` : "Renounce ownership"}</Button>
        </div>
      </Dialog>
    </Panel>
  );
}
