import { describe, expect, it } from "vitest";
import { impersonationIssue, tokenFormSchema } from "../src/lib/validation";

const base = { name: "Acme Points", symbol: "ACME", decimals: 6, initialSupply: "1000000", mintable: false, cap: "", description: "", website: "", logoUrl: "" };

describe("impersonation guard", () => {
  it.each(["USDT", "usdt", "USDC", "TRX", "USDT0", "U$DT", "USD7", "USDTTRC20"])("blocks symbol %s", (s) => {
    expect(impersonationIssue("Something", s)).not.toBeNull();
  });
  it.each(["Tether", "Tether USD", "TRON Token", "USD Coin"])("blocks name %s", (n) => {
    expect(impersonationIssue(n, "XYZ")).not.toBeNull();
  });
  it("allows normal tokens", () => {
    expect(impersonationIssue("Acme Points", "ACME")).toBeNull();
    expect(impersonationIssue("Electron Rewards", "ELR")).toBeNull();
  });
});

describe("tokenFormSchema", () => {
  it("accepts a valid fixed-supply token", () => {
    expect(tokenFormSchema.safeParse(base).success).toBe(true);
  });
  it("rejects zero supply when fixed", () => {
    expect(tokenFormSchema.safeParse({ ...base, initialSupply: "0" }).success).toBe(false);
  });
  it("rejects a cap on fixed tokens and a cap below supply", () => {
    expect(tokenFormSchema.safeParse({ ...base, cap: "5" }).success).toBe(false);
    expect(tokenFormSchema.safeParse({ ...base, mintable: true, cap: "10" }).success).toBe(false);
    expect(tokenFormSchema.safeParse({ ...base, mintable: true, cap: "2000000" }).success).toBe(true);
  });
  it("rejects decimals > 18, http links, and USDT", () => {
    expect(tokenFormSchema.safeParse({ ...base, decimals: 19 }).success).toBe(false);
    expect(tokenFormSchema.safeParse({ ...base, website: "http://x.com" }).success).toBe(false);
    expect(tokenFormSchema.safeParse({ ...base, symbol: "USDT" }).success).toBe(false);
  });
});
