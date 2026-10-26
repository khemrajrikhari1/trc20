"use client";

import { useState } from "react";
import type { NetworkId } from "@/lib/networks";
import { addressUrl, contractUrl, txUrl } from "@/lib/networks";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger"; busy?: boolean };
export function Button({ variant = "primary", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-control px-4 h-10 text-[15px] font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-signal text-white hover:bg-signal/90",
        variant === "quiet" && "border border-line bg-surface text-ink hover:bg-paper",
        variant === "danger" && "bg-bad text-white hover:bg-bad/90",
        className,
      )}
    >
      {busy && <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </button>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-panel border border-line bg-surface", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputCls =
  "w-full h-10 rounded-control border border-line bg-paper px-3 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal";

export type Status = "PENDING" | "CONFIRMED" | "FAILED";
export function StatusPill({ status }: { status: Status }) {
  const map = {
    PENDING: { label: "Pending", cls: "bg-warn/10 text-warn", dot: "bg-warn animate-pulse motion-reduce:animate-none" },
    CONFIRMED: { label: "Confirmed", cls: "bg-ok/10 text-ok", dot: "bg-ok" },
    FAILED: { label: "Failed", cls: "bg-bad/10 text-bad", dot: "bg-bad" },
  }[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium", map.cls)}>
      <span className={cx("size-1.5 rounded-full", map.dot)} aria-hidden />
      {map.label}
    </span>
  );
}

export function Hash({ value, head = 6, tail = 4 }: { value: string; head?: number; tail?: number }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <button
      type="button"
      title={copied ? "Copied" : `Copy ${value}`}
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="font-mono text-[13px] text-ink hover:text-signal focus-visible:outline-signal"
    >
      {copied ? "Copied" : short}
    </button>
  );
}

export function ExplorerLink({ network, kind, value, children }: { network: NetworkId; kind: "tx" | "contract" | "address"; value: string; children?: React.ReactNode }) {
  const href = kind === "tx" ? txUrl(network, value) : kind === "contract" ? contractUrl(network, value) : addressUrl(network, value);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-signal underline-offset-2 hover:underline">
      {children ?? "View on TRONSCAN"}
    </a>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "bad" ? "alert" : "note"}
      className={cx(
        "rounded-control border-l-4 px-4 py-3 text-sm leading-relaxed",
        tone === "info" && "border-signal bg-signal/5 text-ink",
        tone === "warn" && "border-warn bg-warn/10 text-ink",
        tone === "bad" && "border-bad bg-bad/10 text-ink",
        tone === "ok" && "border-ok bg-ok/10 text-ink",
      )}
    >
      {children}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-lg rounded-t-panel sm:rounded-panel bg-surface border border-line shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <header className="border-b border-line px-5 py-4"><h2 className="text-lg font-semibold text-ink">{title}</h2></header>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="text-sm text-ink text-right">{v}</dd>
    </div>
  );
}
