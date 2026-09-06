import { describe, expect, it } from "vitest";
import {
  formatMicroUsd,
  parseMicroUsd,
  parseUsdToMicroUsd,
} from "../../src/domain/money.js";

describe("money helpers", () => {
  it("converts USD without floating point arithmetic", () => {
    expect(parseUsdToMicroUsd("12.345678")).toBe("12345678");
    expect(formatMicroUsd("12345678")).toBe("12.345678");
    expect(parseMicroUsd("12345678")).toBe(12_345_678n);
  });

  it("rejects excessive decimal precision", () => {
    expect(() => parseUsdToMicroUsd("1.0000001")).toThrow();
  });
});
