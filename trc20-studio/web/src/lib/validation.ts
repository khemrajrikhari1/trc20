import { z } from "zod";
import { MAX_UINT256, toBaseUnits } from "./units";

/**
 * Names and symbols that would impersonate major stablecoins, the native asset,
 * or well-known TRON tokens. Deployments using them are refused by the UI and the API.
 */
const RESERVED_SYMBOLS = new Set([
  "USDT", "USDC", "TUSD", "USDD", "USDJ", "BUSD", "DAI", "FDUSD", "PYUSD", "USDE", "EURT", "XAUT",
  "TRX", "WTRX", "BTT", "JST", "SUN", "WIN", "NFT", "BTC", "WBTC", "ETH", "WETH", "BNB",
]);
const RESERVED_NAME_PATTERNS = [/tether/i, /\busd\s*coin\b/i, /\btron\b/i, /\btronix\b/i, /\bbinance\b/i, /circle/i, /\busdt\b/i, /\busdc\b/i];

export function impersonationIssue(name: string, symbol: string): string | null {
  const sym = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (RESERVED_SYMBOLS.has(sym)) return `"${symbol}" is reserved for an existing major asset. Choose your own symbol.`;
  // Lookalikes such as USDT0, USDTT, U$DT, USDT-TRC20
  if (/^U[S$5]D[T7]/.test(symbol.trim().toUpperCase())) return "Symbols that look like USDT are not allowed.";
  for (const p of RESERVED_NAME_PATTERNS) {
    if (p.test(name)) return "This name could be mistaken for an existing stablecoin or TRON itself. Pick a distinct name.";
  }
  return null;
}

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url("Enter a full URL starting with https://")
  .refine((u) => u.startsWith("https://"), "Use an https:// link");

export const tokenFormSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters").max(40, "40 characters max")
      .regex(/^[\p{L}\p{N} .\-']+$/u, "Letters, numbers, spaces, . - ' only"),
    symbol: z.string().trim().min(2, "At least 2 characters").max(10, "10 characters max")
      .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
    decimals: z.coerce.number().int("Whole number").min(0, "0 or more").max(18, "18 max"),
    initialSupply: z.string().trim().regex(/^\d+$/, "Whole tokens only, no commas"),
    mintable: z.boolean(),
    cap: z.string().trim().regex(/^\d*$/, "Whole tokens only").default(""),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    website: httpsUrl.optional().or(z.literal("")),
    logoUrl: httpsUrl.optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    const issue = impersonationIssue(v.name, v.symbol);
    if (issue) ctx.addIssue({ code: "custom", path: ["symbol"], message: issue });

    let supply: bigint;
    try {
      supply = toBaseUnits(v.initialSupply, v.decimals);
    } catch {
      return;
    }
    if (supply === 0n && !v.mintable) {
      ctx.addIssue({ code: "custom", path: ["initialSupply"], message: "A fixed-supply token needs a supply above 0" });
    }
    if (supply > MAX_UINT256) {
      ctx.addIssue({ code: "custom", path: ["initialSupply"], message: "Supply too large for this decimal setting" });
    }
    if (!v.mintable && v.cap && v.cap !== "0") {
      ctx.addIssue({ code: "custom", path: ["cap"], message: "A cap only applies to mintable tokens" });
    }
    if (v.mintable && v.cap && v.cap !== "0") {
      const cap = toBaseUnits(v.cap, v.decimals);
      if (cap < supply) ctx.addIssue({ code: "custom", path: ["cap"], message: "Cap must be at least the initial supply" });
      if (cap > MAX_UINT256) ctx.addIssue({ code: "custom", path: ["cap"], message: "Cap too large" });
    }
  });

export type TokenForm = z.infer<typeof tokenFormSchema>;

export const tronAddress = z.string().trim().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Not a valid TRON address");
export const txHash = z.string().trim().regex(/^[0-9a-fA-F]{64}$/, "Not a valid transaction hash");
export const networkId = z.enum(["mainnet", "nile", "shasta"]);
