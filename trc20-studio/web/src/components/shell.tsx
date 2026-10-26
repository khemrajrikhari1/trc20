"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "./providers";
import { Button, Hash, cx } from "./ui";
import { NETWORKS } from "@/lib/networks";

const NAV = [
  { href: "/", label: "Wallet" },
  { href: "/create", label: "Create token" },
  { href: "/tokens", label: "My tokens" },
  { href: "/transactions", label: "Activity" },
];

export function NetworkBadge() {
  const w = useWallet();
  if (!w.address) return <span className="text-sm text-muted">No wallet</span>;
  if (!w.network) return <span className="rounded-full bg-bad/10 px-2.5 py-1 text-[13px] font-medium text-bad">Unknown network</span>;
  const n = NETWORKS[w.network];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[13px] font-medium",
        !w.networkAllowed ? "bg-bad/10 text-bad" : n.isTestnet ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok",
      )}
      title={w.latestBlock ? `Latest block ${w.latestBlock.toLocaleString()}` : "Waiting for the network"}
    >
      <span className={cx("size-2 rounded-full", w.latestBlock ? "bg-current" : "bg-current/30")} aria-hidden />
      {n.label}
      {!w.networkAllowed && " (disabled)"}
    </span>
  );
}

function WalletButton() {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setErr(null); setBusy(true);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  let control: React.ReactNode;
  if (!w.installed) {
    control = <a className="text-sm font-medium text-signal hover:underline" href="https://www.tronlink.org/" target="_blank" rel="noopener noreferrer">Install TronLink</a>;
  } else if (!w.address) {
    control = <Button busy={busy} onClick={() => run(w.connect)}>Connect wallet</Button>;
  } else if (!w.signedIn) {
    control = <Button busy={busy} onClick={() => run(w.signIn)}>Sign in</Button>;
  } else {
    control = (
      <div className="flex items-center gap-2">
        <Hash value={w.address} />
        <Button variant="quiet" className="h-8 px-3 text-sm" onClick={() => run(w.signOut)}>Sign out</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      {control}
      {err && <p className="mt-1 max-w-xs text-right text-xs text-bad" role="alert">{err}</p>}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const w = useWallet();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-6xl">
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-line min-h-screen px-4 py-6 sticky top-0 h-screen">
          <Link href="/" className="mb-8 px-2 block">
            <span className="block text-[17px] font-semibold tracking-tight">TRC20 Studio</span>
            <span className="block text-xs text-muted mt-0.5">Your own tokens on TRON</span>
          </Link>
          <nav className="space-y-0.5" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={cx("block rounded-control px-3 py-2 text-[15px]", active(n.href) ? "bg-surface border border-line font-medium" : "text-muted hover:text-ink")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-3 px-2 text-xs text-muted leading-relaxed">
            <p>Tokens made here are not USDT and have no value unless a market gives them one.</p>
            <button onClick={w.toggleTheme} className="text-ink underline-offset-2 hover:underline">
              {w.theme === "dark" ? "Use light mode" : "Use dark mode"}
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 pb-20 md:pb-0">
          <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/90 backdrop-blur px-4 md:px-8 py-3">
            <div className="flex items-center gap-3">
              <span className="md:hidden text-[15px] font-semibold">TRC20 Studio</span>
              <NetworkBadge />
            </div>
            <WalletButton />
          </header>
          <main className="px-4 md:px-8 py-6 md:py-8">{children}</main>
        </div>
      </div>

      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 border-t border-line bg-surface">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
            className={cx("py-3 text-center text-[13px]", active(n.href) ? "text-signal font-medium" : "text-muted")}>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Blocks content behind wallet connection + sign-in + an allowed network, with a clear next step. */
export function Gate({ children, needSession = true }: { children: React.ReactNode; needSession?: boolean }) {
  const w = useWallet();
  let msg: string | null = null;
  if (!w.installed) msg = "Install the TronLink browser extension or open this page in the TronLink app to continue.";
  else if (!w.address) msg = "Connect your TronLink wallet using the button at the top right.";
  else if (!w.network) msg = "TronLink is pointed at a node this app doesn't recognise. Switch to Nile, Shasta or Mainnet in TronLink.";
  else if (!w.networkAllowed) msg = `${NETWORKS[w.network].label} is disabled on this deployment. Switch networks in TronLink.`;
  else if (needSession && !w.signedIn) msg = "Sign in with your wallet. It's a free signature that proves you own this address — no transaction is sent.";
  if (msg) return <div className="max-w-xl rounded-panel border border-dashed border-line bg-surface p-6 text-[15px] leading-relaxed text-muted">{msg}</div>;
  return <>{children}</>;
}
