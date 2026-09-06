import { describe, expect, it } from "vitest";
import { extractCostMicroUsd } from "../../src/proxy/usage.js";

describe("extractCostMicroUsd", () => {
  it("extracts provider-reported OpenRouter cost", () => {
    expect(
      extractCostMicroUsd(JSON.stringify({ usage: { cost: 0.123456 } })),
    ).toBe("123456");
  });

  it("returns undefined for invalid or missing usage", () => {
    expect(extractCostMicroUsd("not-json")).toBeUndefined();
    expect(extractCostMicroUsd(JSON.stringify({ usage: {} }))).toBeUndefined();
  });
});
