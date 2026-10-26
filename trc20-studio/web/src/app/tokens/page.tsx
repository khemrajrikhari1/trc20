"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { Gate } from "@/components/shell";
import { ExplorerLink, Hash, Panel, StatusPill } from "@/components/ui";
import { NETWORKS } from "@/lib/networks";
import { sunToTrx } from "@/lib/units";
import { usePollPending } from "@/lib/use-poll";
import type { DeploymentRow } from "@/lib/types";

export default function TokensPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My tokens</h1>
      <Gate><TokenList /></Gate>
    </div>
  );
}

function TokenList() {
  const w = useWallet();
  const [rows, setRows] = useState<DeploymentRow[] | null>(null);
  useEffect(() => {
    fetch("/api/deployments").then((r) => r.json()).then(setRows).catch(() => setRows([]));
  }, [w.address]);
  usePollPending(rows ?? [], (id) => `/api/deployments/${id}`, (u) => setRows((rs) => rs?.map((r) => (r.id === u.id ? u : r)) ?? null));

  if (!rows) return <p className="text-sm text-muted">Loading your deployment records…</p>;
  if (rows.length === 0) return (
    <Panel><p className="text-[15px]">You haven&apos;t deployed a token from this wallet yet. <Link className="text-signal hover:underline" href="/create">Create your first token</Link> on a testnet.</p></Panel>
  );

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="text-left text-muted border-b border-line">
          <tr>
            <th className="px-4 py-3 font-medium">Token</th>
            <th className="px-4 py-3 font-medium">Network</th>
            <th className="px-4 py-3 font-medium">Supply model</th>
            <th className="px-4 py-3 font-medium">Contract</th>
            <th className="px-4 py-3 font-medium">Fee paid</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((d) => (
            <tr key={d.id} className="align-top">
              <td className="px-4 py-3">
                {d.contractAddress && d.status === "CONFIRMED"
                  ? <Link href={`/tokens/${d.contractAddress}`} className="font-medium hover:text-signal">{d.name}</Link>
                  : <span className="font-medium">{d.name}</span>}
                <span className="ml-1.5 text-muted">{d.symbol}</span>
              </td>
              <td className="px-4 py-3">{NETWORKS[d.network].label}</td>
              <td className="px-4 py-3">{d.mintable ? (d.cap !== "0" ? `Mintable, cap ${Number(d.cap).toLocaleString()}` : "Mintable") : "Fixed"}</td>
              <td className="px-4 py-3">
                {d.contractAddress ? <div className="space-y-0.5"><Hash value={d.contractAddress} /><div><ExplorerLink network={d.network} kind="contract" value={d.contractAddress}>TRONSCAN</ExplorerLink></div></div>
                  : <ExplorerLink network={d.network} kind="tx" value={d.txHash}>View tx</ExplorerLink>}
              </td>
              <td className="px-4 py-3 figures">{d.feeSun ? `${sunToTrx(d.feeSun, 2)} TRX` : "—"}</td>
              <td className="px-4 py-3"><StatusPill status={d.status} />{d.failureReason && <p className="mt-1 text-xs text-bad max-w-[16rem]">{d.failureReason}</p>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
