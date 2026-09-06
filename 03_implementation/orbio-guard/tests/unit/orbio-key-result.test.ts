import { describe, expect, it } from "vitest";
import { extractCreatedOrbioKey } from "../../src/orbio/key-result.js";

describe("extractCreatedOrbioKey", () => {
  it("extracts a structured secret and base URL", () => {
    expect(
      extractCreatedOrbioKey({
        structuredContent: {
          key: "or-synthetic-created-key",
          baseUrl: "https://orbio.so/api/v1",
        },
      }),
    ).toEqual({
      key: "or-synthetic-created-key",
      baseUrl: new URL("https://orbio.so/api/v1"),
    });
  });

  it("extracts a key from JSON text content", () => {
    expect(
      extractCreatedOrbioKey({
        content: [
          {
            type: "text",
            text: JSON.stringify({ secret: "or-synthetic-text-key" }),
          },
        ],
      }).key,
    ).toBe("or-synthetic-text-key");
  });

  it("rejects responses without a recognizable secret", () => {
    expect(() => extractCreatedOrbioKey({ content: [] })).toThrow(
      "recognizable secret",
    );
  });
});
