import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "../../src/orbio/results.js";

describe("Orbio structured results", () => {
  it("parses sanitized balance and key-status fixtures", async () => {
    const fixtureUrl = new URL("../fixtures/orbio-read-status.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
      balance: unknown;
      keyStatus: unknown;
    };

    expect(orbioBalanceSchema.parse(fixture.balance).balance.usd).toBe(11.09);
    expect(orbioKeyStatusSchema.parse(fixture.keyStatus).hasKey).toBe(false);
  });

  it("rejects responses without structured content", () => {
    expect(() =>
      parseStructuredToolResult(
        { content: [{ type: "text", text: "missing" }] },
        orbioBalanceSchema,
      ),
    ).toThrow("structured content");
  });
});
