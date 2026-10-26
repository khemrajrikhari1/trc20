"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/providers";
import { Gate } from "@/components/shell";
import { ExplorerLink, Hash, StatusPill, type Status } from "@/components/ui";
import { fromBaseUnits, sunToTrx } from "@/lib/units";
import { usePollPending } from "@/lib/use-poll";
import type { ChainTransfer, TxRow } from "@/lib/types";

interface Line { key: string; hash: string; when: number; direction: "in" | "out"; counterparty: string; amount: string; symbol: string; status: Status; fee?: string | null; source: "app" | "chain" }

export default function ActivityPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <Gate><Activity /></Gate>
    </div>
  );
}

function Activity() {
  const w = useWallet();
  const [mine, setMine] = useState<TxRow[]>([]);
  const [chain, setChain] = useState<ChainTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/transactions?network=${w.network}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/history?address=${w.address}&network=${w.network}`).then((r) => r.json()),
    ]).then(([a, b]) => { setMine(a); setChain(b.transfers ?? []); }).finally(() => setLoading(false));
  }, [w.address, w.network]);

  usePollPending(mine, (id) => `/api/transactions/${id}`, (u) => setMine((rs) => rs.map((r) => (r.id === u.id ? u : r))));

  const lines = useMemo<Line[]>(() => {
    const seen = new Set<string>();
    const out: Line[] = [];
    // App-initiated records first: they include pending/failed items the indexer won't show.
    for (const t of mine) {
      seen.add(t.txHash);
      out.push({ key: t.id, hash: t.txHash, when: Date.parse(t.createdAt), direction: "out", counterparty: t.toAddress, amount: t.amount, symbol: t.symbol ?? "", status: t.status, fee: t.feeSun, source: "app" });
    }
    for (const c of chain) {
      if (seen.has(c.txHash)) continue;
      const incoming = c.to === w.address;
      out.push({ key: c.txHash + c.from + c.to, hash: c.txHash, when: c.timestamp, direction: incoming ? "in" : "out", counterparty: incoming ? c.from : c.to, amount: fromBaseUnits(c.value, Number(c.token.decimals)), symbol: c.token.symbol, status: "CONFIRMED", source: "chain" });
    }
    return out.sort((a, b) => b.when - a.when);
  }, [mine, chain, w.address]);

  if (loading) return <p className="text-sm text-muted">Loading activity…</p>;
  if (lines.length === 0) return <p className="text-[15px] text-muted">No token transfers on this network yet.</p>;

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="text-left text-muted border-b border-line">
          <tr>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium text-right">Amount</th>
            <th className="px-4 py-3 font-medium">Counterparty</th>
            <th className="px-4 py-3 font-medium">Fee</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Explorer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{new Date(l.when).toLocaleString()}</td>
              <td className="px-4 py-3">{l.direction === "in" ? "Received" : "Sent"}</td>
              <td className={`px-4 py-3 text-right figures whitespace-nowrap ${l.direction === "in" ? "text-ok" : ""}`}>{l.direction === "in" ? "+" : "−"}{l.amount} <span className="text-muted">{l.symbol}</span></td>
              <td className="px-4 py-3"><Hash value={l.counterparty} /></td>
              <td className="px-4 py-3 figures">{l.fee ? `${sunToTrx(l.fee, 3)} TRX` : "—"}</td>
              <td className="px-4 py-3"><StatusPill status={l.status} /></td>
              <td className="px-4 py-3"><ExplorerLink network={w.network!} kind="tx" value={l.hash}>Open</ExplorerLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
