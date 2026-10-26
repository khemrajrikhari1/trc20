// Exact decimal <-> integer conversion using BigInt. Never use floats for token amounts.

export const SUN_PER_TRX = 1_000_000n;

export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a plain number, like 1000 or 12.5");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function fromBaseUnits(value: bigint | string, decimals: number, maxFrac = decimals): string {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + wholeStr + (frac ? "." + frac : "");
}

export const sunToTrx = (sun: bigint | number | string, maxFrac = 6) => fromBaseUnits(BigInt(sun), 6, maxFrac);

export const MAX_UINT256 = 2n ** 256n - 1n;
