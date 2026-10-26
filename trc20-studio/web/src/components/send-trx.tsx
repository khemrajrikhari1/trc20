"use client";

import { useState } from "react";
import { useWallet } from "./providers";
import { Button, Dialog, ExplorerLink, Field, Hash, Notice, Panel, Row, StatusPill, inputCls } from "./ui";
import { NETWORKS } from "@/lib/networks";
import { SUN_PER_TRX, sunToTrx, toBaseUnits } from "@/lib/units";
import { estimateTrxTransfer, isValidAddress, sendTrx } from "@/lib/tron-client";
import { usePollPending } from "@/lib/use-poll";
import type { TxRow } from "@/lib/types";

export function SendTrxPanel() {
  const w = useWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ sun: bigint; fee: Awaited<ReturnType<typeof estimateTrxTransfer>> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<TxRow | null>(null);
  usePollPending(tx ? [tx] : [], (id) => `/api/transactions/${id}`, (u) => { setTx(u); if (u.status !== "PENDING") w.refreshBalance(); });

  if (!w.signedIn) {
    return <Panel title="Send TRX"><p className="text-sm text-muted">Sign in with your wallet to send TRX from here.</p></Panel>;
  }

  const review = async () => {
    setErr(null);
    try {
      if (!isValidAddress(to)) throw new Error("Enter a valid TRON address starting with T.");
      if (to === w.address) throw new Error("That's your own address.");
      const sun = toBaseUnits(amount, 6);
      if (sun <= 0n) throw new Error("Amount must be more than 0.");
      const fee = await estimateTrxTransfer(w.address!, to);
      if (w.trxSun !== null && sun + fee.totalSun > w.trxSun) {
        throw new Error(`Not enough TRX. You need ${sunToTrx(sun + fee.totalSun, 6)} TRX including fees, and have ${sunToTrx(w.trxSun, 6)}.`);
      }
      setQuote({ sun, fee });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const setMax = async () => {
    if (w.trxSun === null) return;
    // Leave a buffer for bandwidth + possible activation fee.
    const reserve = 2n * SUN_PER_TRX;
    setAmount(w.trxSun > reserve ? sunToTrx(w.trxSun - reserve, 6).replace(/,/g, "") : "0");
  };

  const send = async () => {
    if (!quote) return;
    setBusy(true); setErr(null);
    try {
      const { txHash } = await sendTrx(w.address!, to, quote.sun);
      const r = await fetch("/api/transactions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: w.network, txHash, kind: "trx_transfer", toAddress: to, amount, symbol: "TRX" }),
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
    <Panel title="Send TRX">
      <div className="space-y-4">
        <Field label="Recipient address" htmlFor="trx-to">
          <input id="trx-to" className={`${inputCls} font-mono text-[13px]`} value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="T…" autoComplete="off" />
        </Field>
        <Field label="Amount (TRX)" htmlFor="trx-amt" hint={w.trxSun !== null ? `Available: ${sunToTrx(w.trxSun, 6)} TRX` : undefined}>
          <div className="flex gap-2">
            <input id="trx-amt" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            <Button variant="quiet" type="button" onClick={setMax}>Max</Button>
          </div>
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button onClick={review} disabled={!to || !amount}>Review transfer</Button>
        {tx && (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="text-sm"><p>{tx.amount} TRX to <Hash value={tx.toAddress} /></p><ExplorerLink network={tx.network} kind="tx" value={tx.txHash} /></div>
            <StatusPill status={tx.status} />
          </div>
        )}
      </div>

      <Dialog open={!!quote} onClose={() => !busy && setQuote(null)} title="Confirm TRX transfer">
        {quote && (
          <>
            <dl>
              <Row k="Send" v={<span className="figures font-medium">{amount} TRX</span>} />
              <Row k="To" v={<span className="font-mono text-[13px] break-all">{to}</span>} />
              <Row k="Network" v={NETWORKS[w.network!].label} />
              <Row k="Bandwidth fee" v={<span className="figures">{quote.fee.bandwidthSun === 0n ? "Free (daily bandwidth)" : `≈ ${sunToTrx(quote.fee.bandwidthSun, 3)} TRX`}</span>} />
              {!quote.fee.recipientActive && <Row k="New address activation" v={<span className="figures">≈ {sunToTrx(quote.fee.activationSun, 2)} TRX</span>} />}
              <Row k="Total cost" v={<span className="figures font-medium">≈ {sunToTrx(quote.sun + quote.fee.totalSun, 6)} TRX</span>} />
            </dl>
            {!quote.fee.recipientActive && <Notice tone="info">This address has never been used on {NETWORKS[w.network!].label}. Your transfer will activate it, which costs a one-time fee.</Notice>}
            <Notice tone="warn">Blockchain transfers can&apos;t be reversed. Double-check the address.</Notice>
            <div className="flex justify-end gap-3">
              <Button variant="quiet" onClick={() => setQuote(null)} disabled={busy}>Cancel</Button>
              <Button onClick={send} busy={busy}>Send TRX</Button>
            </div>
          </>
        )}
      </Dialog>
    </Panel>
  );
}
