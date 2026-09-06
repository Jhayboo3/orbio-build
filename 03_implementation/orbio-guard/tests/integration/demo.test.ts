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

  it("can advance one recorded step at a time", async () => {
    const demo = await createMockDemo();
    try {
      expect((await demo.result()).steps).toHaveLength(0);
      expect(await demo.runNext()).toMatchObject({
        agent: "Alpha research",
        status: 200,
      });
      expect((await demo.result()).steps).toHaveLength(1);
      await demo.runNext();
      await demo.runNext();
      expect((await demo.result()).steps.map((step) => step.status)).toEqual([
        200,
        200,
        429,
      ]);
    } finally {
      await demo.close();
    }
  });
});
