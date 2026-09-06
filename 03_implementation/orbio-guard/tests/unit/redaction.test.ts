import { describe, expect, it } from "vitest";
import { redactValue } from "../../src/shared/redaction.js";

describe("redactValue", () => {
  it("redacts nested secret fields and bearer tokens", () => {
    expect(
      redactValue({
        authorization: "Bearer visible-token",
        nested: {
          message: "Authorization failed for Bearer abc.def.ghi",
          refresh_token: "refresh-value",
        },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: {
        message: "Authorization failed for Bearer [REDACTED]",
        refresh_token: "[REDACTED]",
      },
    });
  });
});
