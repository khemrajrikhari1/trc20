"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { Gate } from "@/components/shell";
import { SendTrxPanel } from "@/components/send-trx";
import { ExplorerLink, Hash, Notice, Panel, StatusPill, cx } from "@/components/ui";
import { NETWORKS, OFFICIAL_USDT_MAINNET } from "@/lib/networks";
import { fromBaseUnits, sunToTrx } from "@/lib/units";
import { readTrc20 } from "@/lib/tron-client";
import type { ChainTransfer, DeploymentRow } from "@/lib/types";

interface Holding { contract: string; name: string; symbol: string; decimals: number; balance: bigint; mine: boolean }

export default function WalletPage() {
  const w = useWallet();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [transfers, setTransfers] = useState<ChainTransfer[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!w.address || !w.network || !w.networkAllowed) return;
    let alive = true;
    (async () => {
      setErr(null); setHoldings(null);
      try {
        const [hist, mine] = await Promise.all([
          fetch(`/api/history?address=${w.address}&network=${w.network}`).then((r) => r.json()),
          w.signedIn ? fetch(`/api/deployments?network=${w.network}`).then((r) => (r.ok ? r.json() : [])) : Promise.resolve([]),
        ]);
        const contracts = new Set<string>((hist.trc20 ?? []).map((t: { contract: string }) => t.contract));
        const mineSet = new Set<string>();
        (mine as DeploymentRow[]).forEach((d) => { if (d.contractAddress && d.status === "CONFIRMED") { contracts.add(d.contractAddress); mineSet.add(d.contractAddress); } });

        // Read every balance directly from its contract — the indexer is only used to discover them.
        const rows = await Promise.all([...contracts].map(async (c) => {
          try { const m = await readTrc20(c, w.address!); return { contract: c, ...m, mine: mineSet.has(c) }; } catch { return null; }
        }));
        if (!alive) return;
        setHoldings(rows.filter((r): r is Holding => !!r).sort((a, b) => Number(b.mine) - Number(a.mine)));
        setTransfers((hist.transfers ?? []).slice(0, 8));
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load balances");
      }
    })();
    return () => { alive = false; };
  }, [w.address, w.network, w.networkAllowed, w.signedIn]);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
      <Gate needSession={false}>
        {w.network && NETWORKS[w.network].isTestnet && (
          <Notice tone="warn">
            You're on {NETWORKS[w.network].label}. Test TRX and tokens here have no value.{" "}
            {NETWORKS[w.network].faucet && <a className="underline" href={NETWORKS[w.network].faucet} target="_blank" rel="noopener noreferrer">Get free test TRX</a>}
          </Notice>
        )}

        <div className="grid gap-6 lg:grid-cols-5 items-start">
        <section className="lg:col-span-3 rounded-panel border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm text-muted">TRX balance</p>
              <p className="mt-1 text-4xl md:text-5xl font-semibold tracking-tight figures">
                {w.trxSun === null ? "—" : sunToTrx(w.trxSun, 4)}
                <span className="ml-2 text-xl font-normal text-muted">TRX</span>
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <dt className="text-muted">Address</dt><dd>{w.address && <Hash value={w.address} head={8} tail={6} />}</dd>
              <dt className="text-muted">Network</dt><dd>{w.network ? NETWORKS[w.network].label : "—"}</dd>
              <dt className="text-muted">Latest block</dt><dd className="figures">{w.latestBlock?.toLocaleString() ?? "—"}</dd>
            </dl>
          </div>
          {w.address && w.network && <div className="mt-4"><ExplorerLink network={w.network} kind="address" value={w.address}>Open this address on TRONSCAN</ExplorerLink></div>}
        </section>
        <div className="lg:col-span-2"><SendTrxPanel /></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Panel title="Token balances" className="lg:col-span-3" action={<Link href="/create" className="text-sm text-signal hover:underline">Create a token</Link>}>
            {err && <Notice tone="bad">{err}</Notice>}
            {!holdings && !err && <p className="text-sm text-muted">Reading balances from the chain…</p>}
            {holdings?.length === 0 && <p className="text-sm text-muted">No TRC20 tokens in this wallet on this network yet.</p>}
            {holdings && holdings.length > 0 && (
              <ul className="divide-y divide-line">
                {holdings.map((h) => {
                  const officialUsdt = w.network === "mainnet" && h.contract === OFFICIAL_USDT_MAINNET;
                  const fakeUsdt = !officialUsdt && /^U[S$5]D[T7]/i.test(h.symbol);
                  return (
                    <li key={h.contract} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {h.name} <span className="text-muted font-normal">{h.symbol}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <Hash value={h.contract} />
                          {h.mine && <span className="rounded-full bg-signal/10 px-2 text-xs text-signal">Created by you</span>}
                          {officialUsdt && <span className="rounded-full bg-ok/10 px-2 text-xs text-ok">Official Tether USDT</span>}
                          {fakeUsdt && <span className="rounded-full bg-bad/10 px-2 text-xs text-bad">Not real USDT — unknown contract</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="figures font-medium">{fromBaseUnits(h.balance, h.decimals, 6)}</p>
                        {h.mine
                          ? <Link className="text-sm text-signal hover:underline" href={`/tokens/${h.contract}`}>Manage</Link>
                          : <Link className="text-sm text-signal hover:underline" href={`/tokens/${h.contract}`}>Send</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent token transfers" className="lg:col-span-2" action={<Link href="/transactions" className="text-sm text-signal hover:underline">All activity</Link>}>
            {transfers.length === 0 ? <p className="text-sm text-muted">No confirmed TRC20 transfers yet.</p> : (
              <ul className="space-y-3">
                {transfers.map((t) => {
                  const incoming = t.to === w.address;
                  return (
                    <li key={t.txHash + t.from + t.to} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">{incoming ? "Received" : "Sent"} <span className="text-muted">{t.token.symbol}</span></p>
                        {w.network && <ExplorerLink network={w.network} kind="tx" value={t.txHash}>{new Date(t.timestamp).toLocaleString()}</ExplorerLink>}
                      </div>
                      <div className="text-right">
                        <p className={cx("figures text-sm font-medium", incoming ? "text-ok" : "text-ink")}>
                          {incoming ? "+" : "−"}{fromBaseUnits(t.value, Number(t.token.decimals), 4)}
                        </p>
                        <StatusPill status="CONFIRMED" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </Gate>
    </div>
  );
}
