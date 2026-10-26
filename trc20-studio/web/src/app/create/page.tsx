"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/providers";
import { Gate } from "@/components/shell";
import { Button, ExplorerLink, Field, Hash, Notice, Panel, Row, StatusPill, cx, inputCls } from "@/components/ui";
import { NETWORKS } from "@/lib/networks";
import { tokenFormSchema, type TokenForm } from "@/lib/validation";
import { fromBaseUnits, sunToTrx, toBaseUnits } from "@/lib/units";
import {
  DEPLOY_FEE_LIMIT_SUN, availableEnergy, deployToken, energyPriceSun, estimateDeployEnergy,
} from "@/lib/tron-client";
import { usePollPending } from "@/lib/use-poll";
import type { DeploymentRow } from "@/lib/types";

const STEPS = [
  { title: "Name and symbol", fields: ["name", "symbol", "decimals"] },
  { title: "Supply", fields: ["initialSupply", "mintable", "cap"] },
  { title: "Profile", fields: ["description", "website", "logoUrl"] },
  { title: "Review and deploy", fields: [] },
] as const;

const EMPTY: TokenForm = {
  name: "", symbol: "", decimals: 6, initialSupply: "", mintable: false, cap: "",
  description: "", website: "", logoUrl: "",
};

export default function CreatePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a token</h1>
        <p className="mt-1 text-[15px] text-muted max-w-prose">
          Deploys a standard TRC20 contract from your wallet. You own the contract and pay the network fee.
          Try it on a testnet first.
        </p>
      </div>
      <Gate><Wizard /></Gate>
    </div>
  );
}

function Wizard() {
  const w = useWallet();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TokenForm>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [deployment, setDeployment] = useState<DeploymentRow | null>(null);

  const parsed = useMemo(() => tokenFormSchema.safeParse(form), [form]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) { const k = String(i.path[0]); if (!e[k]) e[k] = i.message; }
    return e;
  }, [parsed]);

  const set = <K extends keyof TokenForm>(k: K, v: TokenForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const stepErrors = (i: number) => (STEPS[i].fields as readonly string[]).filter((f) => errors[f]);
  const next = () => {
    setTouched((t) => new Set([...t, ...STEPS[step].fields]));
    if (stepErrors(step).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const err = (k: string) => (touched.has(k) ? errors[k] : undefined);

  if (deployment) return <DeployTracker initial={deployment} />;

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cx(
                "rounded-full border px-3 py-1 text-sm",
                i === step ? "border-signal bg-signal text-white" : i < step ? "border-line bg-surface text-ink hover:border-signal" : "border-line text-muted",
              )}
            >
              {i + 1}. {s.title}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Panel>
          <div className="space-y-5">
            <Field label="Token name" htmlFor="name" error={err("name")} hint="Shown in wallets, e.g. Acme Points">
              <input id="name" className={inputCls} value={form.name} maxLength={40} autoComplete="off"
                onChange={(e) => set("name", e.target.value)} onBlur={() => setTouched((t) => new Set(t).add("name"))} />
            </Field>
            <Field label="Symbol" htmlFor="symbol" error={err("symbol") ?? (form.symbol && errors.symbol)} hint="2–10 letters or numbers, e.g. ACME">
              <input id="symbol" className={cx(inputCls, "uppercase")} value={form.symbol} maxLength={10} autoComplete="off"
                onChange={(e) => set("symbol", e.target.value.toUpperCase())} onBlur={() => setTouched((t) => new Set(t).add("symbol"))} />
            </Field>
            <Field label="Decimal places" htmlFor="decimals" error={err("decimals")} hint="How finely the token can be split. 6 matches most TRON tokens; 0 makes it whole units only.">
              <input id="decimals" type="number" min={0} max={18} className={cx(inputCls, "w-28")} value={form.decimals}
                onChange={(e) => set("decimals", Number(e.target.value))} />
            </Field>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel>
          <div className="space-y-5">
            <Field label="Initial supply" htmlFor="supply" error={err("initialSupply")} hint="Whole tokens. All of it goes to your connected wallet.">
              <input id="supply" inputMode="numeric" className={inputCls} value={form.initialSupply} placeholder="1000000"
                onChange={(e) => set("initialSupply", e.target.value.replace(/[^\d]/g, ""))} />
            </Field>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Supply model</legend>
              {[
                { v: false, t: "Fixed supply", d: "No one, including you, can ever create more. The contract has no owner or admin functions." },
                { v: true, t: "Mintable by you", d: "Your wallet can create more later, up to an optional cap. You can give up this right permanently at any time." },
              ].map((o) => (
                <label key={String(o.v)} className={cx("flex gap-3 rounded-control border p-4 cursor-pointer", form.mintable === o.v ? "border-signal bg-signal/5" : "border-line")}>
                  <input type="radio" name="mintable" className="mt-1 accent-[rgb(var(--signal))]" checked={form.mintable === o.v}
                    onChange={() => { set("mintable", o.v); if (!o.v) set("cap", ""); }} />
                  <span>
                    <span className="block font-medium">{o.t}</span>
                    <span className="block text-sm text-muted mt-0.5">{o.d}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {form.mintable && (
              <Field label="Maximum supply (optional)" htmlFor="cap" error={err("cap")} hint="Leave empty for no cap. Holders tend to trust capped tokens more.">
                <input id="cap" inputMode="numeric" className={inputCls} value={form.cap} placeholder="No cap"
                  onChange={(e) => set("cap", e.target.value.replace(/[^\d]/g, ""))} />
              </Field>
            )}
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel>
          <div className="space-y-5">
            <p className="text-sm text-muted">Optional. Stored with your deployment record in this app — not written to the contract.</p>
            <Field label="Description" htmlFor="desc" error={err("description")}>
              <textarea id="desc" rows={3} maxLength={500} className={cx(inputCls, "h-auto py-2")} value={form.description}
                onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="web" error={err("website")}>
              <input id="web" type="url" className={inputCls} placeholder="https://" value={form.website}
                onChange={(e) => set("website", e.target.value)} onBlur={() => setTouched((t) => new Set(t).add("website"))} />
            </Field>
            <Field label="Logo URL" htmlFor="logo" error={err("logoUrl")} hint="A square PNG or SVG. You can also add it on TRONSCAN after verifying the contract.">
              <input id="logo" type="url" className={inputCls} placeholder="https://" value={form.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)} onBlur={() => setTouched((t) => new Set(t).add("logoUrl"))} />
            </Field>
          </div>
        </Panel>
      )}

      {step === 3 && parsed.success && <Review form={parsed.data} onDeployed={setDeployment} />}
      {step === 3 && !parsed.success && <Notice tone="bad">Some details need fixing. Go back to the step marked with an error.</Notice>}

      {step < 3 && (
        <div className="flex justify-between">
          <Button variant="quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
          <Button onClick={next}>Continue</Button>
        </div>
      )}
      {!w.network || !NETWORKS[w.network].isTestnet ? null : (
        <p className="text-sm text-muted">Deploying to {NETWORKS[w.network].label}. Tokens here are for testing only.</p>
      )}
    </div>
  );
}

function Review({ form, onDeployed }: { form: TokenForm; onDeployed: (d: DeploymentRow) => void }) {
  const w = useWallet();
  const net = NETWORKS[w.network!];
  const [fee, setFee] = useState<{ energy: bigint; price: bigint; free: bigint } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastHash, setBroadcastHash] = useState<string | null>(null);

  const supplyBase = toBaseUnits(form.initialSupply, form.decimals);
  const capBase = form.mintable && form.cap ? toBaseUnits(form.cap, form.decimals) : 0n;

  useEffect(() => {
    (async () => {
      try {
        const [price, free] = await Promise.all([energyPriceSun(), availableEnergy(w.address!)]);
        setFee({ energy: estimateDeployEnergy(), price, free });
      } catch { setFee(null); }
    })();
  }, [w.address, w.network]);

  const burnEnergy = fee ? (fee.energy > fee.free ? fee.energy - fee.free : 0n) : 0n;
  const estTrxSun = fee ? burnEnergy * fee.price : null;
  const lowBalance = estTrxSun !== null && w.trxSun !== null && w.trxSun < estTrxSun;
  const mainnetReady = net.isTestnet || (ack && confirmText.trim().toUpperCase() === form.symbol.toUpperCase());

  const deploy = async () => {
    setError(null); setBusy(true);
    try {
      const { txHash } = await deployToken(w.address!, {
        name: form.name, symbol: form.symbol.toUpperCase(), decimals: form.decimals,
        supplyBase, mintable: form.mintable, capBase,
      });
      setBroadcastHash(txHash);
      const r = await fetch("/api/deployments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: w.network, txHash, form }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`Broadcast succeeded (tx ${txHash}) but saving the record failed: ${d.error}`);
      onDeployed(d);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(/cancel|declin|reject/i.test(m) ? "You declined the transaction in TronLink. Nothing was sent." : m);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Panel title="What will be deployed">
        <div className="rounded-control border border-dashed border-line bg-paper p-4 font-mono text-[13px] leading-6 overflow-x-auto">
          <p className="text-muted">// StudioTRC20 constructor</p>
          <p>name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &quot;{form.name}&quot;</p>
          <p>symbol&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &quot;{form.symbol.toUpperCase()}&quot;</p>
          <p>decimals&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {form.decimals}</p>
          <p>initialSupply = {supplyBase.toString()}</p>
          <p>mintable&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {String(form.mintable)}</p>
          <p>cap&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {capBase.toString()}</p>
        </div>
        <dl className="mt-4">
          <Row k="Network" v={net.label} />
          <Row k="Owner wallet" v={<Hash value={w.address!} head={8} tail={6} />} />
          <Row k="Initial supply" v={<span className="figures">{fromBaseUnits(supplyBase, form.decimals)} {form.symbol.toUpperCase()}</span>} />
          <Row k="Supply model" v={form.mintable ? (capBase ? `Mintable up to ${fromBaseUnits(capBase, form.decimals)}` : "Mintable, no cap") : "Fixed forever"} />
        </dl>
        <p className="mt-4 text-sm text-muted">
          The contract has no hidden functions, no transfer fees, no blacklist and cannot touch anyone else&apos;s balance.
          {form.mintable ? " Only your wallet can mint, until you renounce ownership." : " It has no owner at all."}
        </p>
      </Panel>

      <Panel title="Network fee">
        {!fee ? <p className="text-sm text-muted">Reading current energy price…</p> : (
          <dl>
            <Row k="Estimated energy" v={<span className="figures">{fee.energy.toLocaleString()}</span>} />
            <Row k="Your free energy" v={<span className="figures">{fee.free.toLocaleString()}</span>} />
            <Row k="Energy price" v={<span className="figures">{fee.price.toString()} sun</span>} />
            <Row k="Estimated cost" v={<span className="figures font-medium">≈ {sunToTrx(estTrxSun!, 2)} TRX</span>} />
            <Row k="Maximum you can be charged" v={<span className="figures">{sunToTrx(DEPLOY_FEE_LIMIT_SUN, 0)} TRX fee limit</span>} />
          </dl>
        )}
        <p className="mt-3 text-sm text-muted">Deployment cost can only be estimated. TronLink shows the final figure before you approve, and the actual fee is recorded from the chain receipt.</p>
        {lowBalance && <div className="mt-3"><Notice tone="warn">Your TRX balance looks lower than the estimated cost. The deployment may fail and still consume some fee.</Notice></div>}
      </Panel>

      {!net.isTestnet && (
        <Panel title="Mainnet confirmation">
          <div className="space-y-4">
            <Notice tone="warn">
              This uses real TRX and can&apos;t be undone. A new token has no market price or liquidity — it is only worth something if people choose to trade it.
              Your token is not USDT and must never be presented as USDT.
            </Notice>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span>I deployed and tested these exact settings on Nile or Shasta first.</span>
            </label>
            <Field label={`Type ${form.symbol.toUpperCase()} to confirm`} htmlFor="confirm">
              <input id="confirm" className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        </Panel>
      )}

      {error && <Notice tone="bad">{error}{broadcastHash && <> <ExplorerLink network={w.network!} kind="tx" value={broadcastHash} /></>}</Notice>}

      <div className="flex justify-end">
        <Button onClick={deploy} busy={busy} disabled={!mainnetReady}>
          {busy ? "Waiting for TronLink…" : `Deploy to ${net.label}`}
        </Button>
      </div>
    </div>
  );
}

function DeployTracker({ initial }: { initial: DeploymentRow }) {
  const [d, setD] = useState(initial);
  usePollPending([d], (id) => `/api/deployments/${id}`, setD, 3000);
  const net = NETWORKS[d.network];

  return (
    <Panel title={`${d.name} (${d.symbol})`} action={<StatusPill status={d.status} />}>
      <div className="space-y-4">
        {d.status === "PENDING" && <p className="text-[15px]">Broadcast to {net.label}. Waiting for the transaction to be included in a block — this usually takes under a minute.</p>}
        {d.status === "FAILED" && <Notice tone="bad">The deployment failed on-chain: {d.failureReason}. No token was created.</Notice>}
        {d.status === "CONFIRMED" && (
          <Notice tone="ok">Confirmed in block {Number(d.blockNumber).toLocaleString()}. The full supply is in your wallet.</Notice>
        )}
        <dl>
          <Row k="Transaction" v={<span className="flex items-center gap-3"><Hash value={d.txHash} /><ExplorerLink network={d.network} kind="tx" value={d.txHash}>TRONSCAN</ExplorerLink></span>} />
          {d.contractAddress && <Row k="Contract address" v={<span className="flex items-center gap-3"><Hash value={d.contractAddress} head={8} tail={6} /><ExplorerLink network={d.network} kind="contract" value={d.contractAddress}>TRONSCAN</ExplorerLink></span>} />}
          {d.feeSun && <Row k="Fee paid" v={<span className="figures">{sunToTrx(d.feeSun, 4)} TRX</span>} />}
          {d.energyUsed && <Row k="Energy used" v={<span className="figures">{Number(d.energyUsed).toLocaleString()}</span>} />}
        </dl>
        {d.status === "CONFIRMED" && d.contractAddress && (
          <div className="space-y-3 text-sm text-muted">
            <p>
              Next: verify the source code on TRONSCAN so anyone can read it. Use the file <span className="font-mono text-ink">StudioTRC20.sol</span>,
              compiler 0.8.20, optimizer on with 200 runs, EVM version london.
            </p>
            <div className="flex gap-3">
              <Link href={`/tokens/${d.contractAddress}`} className="text-signal hover:underline">Manage this token</Link>
              <Link href="/create" onClick={() => location.reload()} className="text-signal hover:underline">Create another</Link>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
