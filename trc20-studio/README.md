# TRC20 Studio

Create, deploy and manage your **own** TRC20 tokens on TRON from your own wallet.
Every transaction is signed in TronLink. The server never sees a private key or seed phrase.

> Tokens made here are custom tokens. They are **not USDT**, have **no price or liquidity** by default,
> and the app refuses names/symbols that imitate USDT, USDC, TRX and other major assets.

## What's inside

```
contracts/   Solidity contract, 18 unit tests (Hardhat), TronBox deploy config
web/         Next.js 14 + TypeScript + Tailwind app, Prisma/PostgreSQL, 21 unit tests
```

| Feature | Where |
|---|---|
| TronLink connect + signature sign-in (no passwords) | `web/src/components/providers.tsx`, `web/src/app/api/auth/*` |
| 4-step token wizard: validation, fee estimate, mainnet confirmation | `web/src/app/create/page.tsx` |
| Server-side confirmation from chain receipt + on-chain metadata check | `web/src/app/api/deployments/refresh.ts` |
| Balances read directly from each contract | `web/src/app/page.tsx` |
| Transfers with simulated energy + confirm dialog | `web/src/app/tokens/[address]/page.tsx` |
| Mint / renounce (mintable tokens, owner only) | same page, `OwnerPanel` |
| Activity table: pending → confirmed / failed | `web/src/app/transactions/page.tsx` |
| Official vs look-alike USDT labelling | Wallet + token pages |
| Dark/light mode, responsive desktop + mobile | `web/src/components/shell.tsx` |

## The contract (`contracts/contracts/StudioTRC20.sol`)

- Standard TRC20 (OpenZeppelin ERC20 v4.9 logic, inlined, no imports).
- **Fixed supply** (default): no owner exists, `mint` always reverts.
- **Mintable**: only the owner mints, never above `cap()`; `renounceOwnership()` makes it fixed forever.
- `mintable()`, `deployedAsMintable()`, `cap()`, `owner()` let anyone verify the supply model on-chain.
- No hidden functions, transfer fees, blacklist, pause, or ability to touch other holders' balances.
- Compiler: solc **0.8.20**, optimizer on (200 runs), EVM **london** (no PUSH0, TVM-safe).

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 14+
- TronLink extension (desktop) or TronLink app (mobile)
- Test TRX: Nile faucet https://nileex.io/join/getJoinPage · Shasta faucet https://shasta.tronex.io

## 2. Contracts — test

```bash
cd contracts
npm install
npm test                 # 18 passing
npm run compile          # rebuilds web/src/contracts/StudioTRC20.json (ABI + bytecode + sha256)
```

Optional CLI deploy (the web wizard is the normal path):

```bash
cp .env.example .env     # dedicated deploy wallet only, never your main wallet
npm run deploy:nile
npm run deploy:mainnet   # asks you to type "DEPLOY TO MAINNET" first
```

## 3. Web app — run locally

```bash
cd web
cp .env.example .env     # set DATABASE_URL and SESSION_SECRET (openssl rand -base64 48)
npm install
npx prisma migrate deploy
npm test                 # 21 passing
npm run dev              # http://localhost:3000
```

In TronLink switch to **Nile**, connect, sign in, create a token, then check it on nile.tronscan.org.

## 4. Testnet → mainnet checklist

1. Deploy on Nile with the exact settings you want.
2. Send a transfer to a second wallet; confirm it shows **Confirmed** in Activity.
3. If mintable: test mint, then decide whether to renounce.
4. Verify source on Nile TRONSCAN (Contract → Verify, settings above).
5. Add `mainnet` to `NEXT_PUBLIC_ENABLED_NETWORKS`, switch TronLink to Mainnet.
   The wizard requires a checkbox + typing the symbol before it will deploy.
6. Record the result in `DEPLOYMENTS.md` and verify the source on tronscan.org.

## 5. Production hosting

- Any Node host (Vercel, Render, Fly, VPS) + managed Postgres (Neon, Supabase, RDS).
- Env vars: `DATABASE_URL`, `SESSION_SECRET`, `TRONGRID_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENABLED_NETWORKS`.
- Keep `NEXT_PUBLIC_ENABLED_NETWORKS=nile,shasta` until you are ready to allow mainnet.
- Build: `npm run build` · release step: `npm run db:migrate`.
- Add monitoring (Sentry or host logs) and an uptime check on `/api/auth/me`.
- The rate limiter is in-memory; switch to Redis/Upstash when running more than one instance.

## Security model

- **No keys server-side.** Signing happens in TronLink. The DB stores public addresses and tx metadata only.
- **Sign-in:** single-use nonce (5 min), domain-bound message, `signMessageV2` recovered server-side,
  httpOnly SameSite=Strict JWT cookie (8 h).
- **Never trust the client:** deployments and transfers are saved as `PENDING` and only become `CONFIRMED`
  when the node returns a receipt in a block with `SUCCESS`, sent by the signed-in wallet. Deployments also
  re-read name/symbol/decimals/supply/mintable from the new contract and must match.
- **Session ↔ wallet binding:** switching accounts in TronLink signs you out of the app.
- **Impersonation guard** in both UI and API (`web/src/lib/validation.ts`).
- Security headers (HSTS, frame-deny, nosniff, referrer, permissions) in `next.config.mjs`.
- Run `npm audit` in both folders before release. Get an external audit before promoting any token publicly.

## Honest limitations

- Deployment fee is an **estimate** (contract creation can't be simulated); TronLink shows the final
  figure and the real fee is read from the receipt. Transfer fees are simulated with `triggerConstantContract`.
- TRONSCAN source verification is a manual step on their website.
- Logo/website/description are stored in this app only. To show a logo on TRONSCAN, submit token info there.
