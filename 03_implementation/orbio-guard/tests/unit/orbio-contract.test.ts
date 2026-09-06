import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  compareOrbioToolContract,
  ORBIO_TOOL_NAMES,
} from "../../src/orbio/types.js";

describe("authenticated Orbio tool contract", () => {
  it("matches the sanitized tools/list fixture", async () => {
    const fixtureUrl = new URL("../fixtures/orbio-tools-list.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as Array<{
      name: string;
    }>;

    expect(fixture.map((tool) => tool.name)).toEqual(ORBIO_TOOL_NAMES);
    expect(compareOrbioToolContract(fixture.map((tool) => tool.name))).toEqual({
      missing: [],
      unexpected: [],
    });
  });

  it("reports missing and unexpected tools", () => {
    expect(compareOrbioToolContract(["orbio_get_balance", "orbio_new_tool"])).toEqual({
      missing: [
        "orbio_get_key_status",
        "orbio_create_key",
        "orbio_revoke_key",
        "orbio_delete_key",
      ],
      unexpected: ["orbio_new_tool"],
    });
  });
});
