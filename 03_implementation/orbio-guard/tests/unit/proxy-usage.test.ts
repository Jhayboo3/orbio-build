import { describe, expect, it } from "vitest";
import {
  extractCostMicroUsd,
  extractStreamCostMicroUsd,
} from "../../src/proxy/usage.js";

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

  it("extracts the latest usage cost from SSE events", () => {
    expect(
      extractStreamCostMicroUsd(
        [
          'data: {"type":"response.output_text.delta","delta":"Hi"}',
          'data: {"type":"response.completed","response":{"usage":{"cost":0.0042}}}',
          "data: [DONE]",
        ].join("\n\n"),
      ),
    ).toBe("4200");
  });
});
