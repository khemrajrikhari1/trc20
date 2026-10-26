"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { currentAccount, injected, requestConnection, signLogin, trxBalanceSun, walletInstalled } from "@/lib/tron-client";
import { enabledNetworks, type NetworkId } from "@/lib/networks";

type Theme = "light" | "dark";

interface WalletState {
  installed: boolean;
  address: string | null;
  network: NetworkId | null;
  host: string | null;
  networkAllowed: boolean;
  trxSun: bigint | null;
  sessionAddress: string | null;
  signedIn: boolean;
  latestBlock: number | null;
  connect: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  theme: Theme;
  toggleTheme: () => void;
}

const Ctx = createContext<WalletState | null>(null);
export const useWallet = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside provider");
  return v;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [acct, setAcct] = useState<{ address: string | null; network: NetworkId | null; host: string | null }>({ address: null, network: null, host: null });
  const [trxSun, setTrxSun] = useState<bigint | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const lastKey = useRef("");

  // Theme
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try { localStorage.setItem("theme", next); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // Wallet: TronLink injects late and changes accounts/nodes without reliable events, so poll lightly.
  const sync = useCallback(() => {
    setInstalled(walletInstalled());
    const a = currentAccount();
    const key = `${a.address}|${a.host}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setAcct(a);
      setTrxSun(null);
    }
  }, []);
  useEffect(() => {
    sync();
    const id = setInterval(sync, 1500);
    const onMsg = (e: MessageEvent) => {
      const action = e.data?.message?.action;
      if (action === "setAccount" || action === "setNode" || action === "accountsChanged" || action === "connect") sync();
    };
    window.addEventListener("message", onMsg);
    return () => { clearInterval(id); window.removeEventListener("message", onMsg); };
  }, [sync]);

  const refreshBalance = useCallback(async () => {
    if (!acct.address) return;
    try { setTrxSun(await trxBalanceSun(acct.address)); } catch { setTrxSun(null); }
  }, [acct.address]);
  useEffect(() => { refreshBalance(); }, [refreshBalance, acct.host]);

  // Network heartbeat
  useEffect(() => {
    if (!acct.network) { setLatestBlock(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const b = await injected()?.trx.getCurrentBlock();
        if (alive) setLatestBlock(b?.block_header?.raw_data?.number ?? null);
      } catch { if (alive) setLatestBlock(null); }
    };
    tick();
    const id = setInterval(tick, 9000);
    return () => { alive = false; clearInterval(id); };
  }, [acct.network, acct.host]);

  // Session
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setSessionAddress(d.address ?? null)).catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    await requestConnection();
    sync();
  }, [sync]);

  const signIn = useCallback(async () => {
    const a = currentAccount().address;
    if (!a) throw new Error("Connect your wallet first.");
    const n = await fetch("/api/auth/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: a }) });
    const nd = await n.json();
    if (!n.ok) throw new Error(nd.error || "Could not start sign-in");
    const signature = await signLogin(nd.message);
    const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce: nd.nonce, signature }) });
    const vd = await v.json();
    if (!v.ok) throw new Error(vd.error || "Sign-in failed");
    setSessionAddress(vd.address);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSessionAddress(null);
  }, []);

  const value = useMemo<WalletState>(() => ({
    installed,
    ...acct,
    networkAllowed: !!acct.network && enabledNetworks().includes(acct.network),
    trxSun,
    sessionAddress,
    // The session must belong to the wallet currently selected in TronLink.
    signedIn: !!sessionAddress && sessionAddress === acct.address,
    latestBlock,
    connect, signIn, signOut, refreshBalance, theme, toggleTheme,
  }), [installed, acct, trxSun, sessionAddress, latestBlock, connect, signIn, signOut, refreshBalance, theme, toggleTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
