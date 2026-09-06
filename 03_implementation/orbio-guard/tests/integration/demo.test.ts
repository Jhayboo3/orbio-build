import { describe, expect, it } from "vitest";
import { createMockDemo } from "../../src/demo/mock-demo.js";

describe("two-agent mock demo", () => {
  it("blocks the over-budget agent while the other agent continues", async () => {
    const demo = await createMockDemo();
    try {
      const result = await demo.run();
      expect(result.mode).toBe("mock");
      expect(result.steps.map((step) => step.status)).toEqual([200, 200, 429, 200]);
      expect(result.activityTypes).toEqual(
        expect.arrayContaining([
          "REQUEST_ALLOWED",
          "SPEND_CONFIRMED",
          "REQUEST_BLOCKED",
        ]),
      );
      expect(await fetch(result.dashboardUrl)).toMatchObject({ status: 200 });
    } finally {
      await demo.close();
    }
  });
});
