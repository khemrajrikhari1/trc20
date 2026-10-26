import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits } from "../src/lib/units";

describe("toBaseUnits", () => {
  it("scales whole and fractional amounts exactly", () => {
    expect(toBaseUnits("1", 6)).toBe(1_000_000n);
    expect(toBaseUnits("12.5", 6)).toBe(12_500_000n);
    expect(toBaseUnits("0.000001", 6)).toBe(1n);
    expect(toBaseUnits("1000000", 18)).toBe(10n ** 24n);
  });
  it("rejects too many decimals and junk", () => {
    expect(() => toBaseUnits("0.0000001", 6)).toThrow();
    expect(() => toBaseUnits("1,000", 6)).toThrow();
    expect(() => toBaseUnits("-1", 6)).toThrow();
    expect(() => toBaseUnits("1e6", 6)).toThrow();
  });
});

describe("fromBaseUnits", () => {
  it("formats with grouping and trims zeros", () => {
    expect(fromBaseUnits(1_234_500_000n, 6)).toBe("1,234.5");
    expect(fromBaseUnits(1n, 6)).toBe("0.000001");
    expect(fromBaseUnits(5n, 0)).toBe("5");
  });
  it("round-trips", () => {
    for (const v of ["0.1", "123456789.123456", "7"]) {
      expect(fromBaseUnits(toBaseUnits(v, 6), 6).replace(/,/g, "")).toBe(v);
    }
  });
});
