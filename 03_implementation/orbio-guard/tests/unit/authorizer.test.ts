import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GuardAuthorizationError,
  GuardRequestAuthorizer,
} from "../../src/control/authorizer.js";
import { GuardControlService } from "../../src/control/service.js";
import { BudgetService } from "../../src/domain/budget.js";
import { GuardStateStore } from "../../src/state/store.js";

describe("GuardRequestAuthorizer", () => {
  let control: GuardControlService;
  let authorizer: GuardRequestAuthorizer;
  let token: string;
  let agentId: string;

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-authorizer-"));
    const store = new GuardStateStore(directory);
    control = new GuardControlService(store);
    authorizer = new GuardRequestAuthorizer(
      control,
      new BudgetService(store, () => new Date("2026-09-06T12:00:00.000Z")),
    );
    const created = await control.addAgent({
      allowedModels: ["openai/*"],
      dailyBudgetMicroUsd: "1000000",
      maxRequestMicroUsd: "800000",
      name: "Authorized agent",
    });
    token = created.token;
    agentId = created.agent.id;
  });

  it("authenticates, applies policy, and reserves budget", async () => {
    const result = await authorizer.authorize({
      agentToken: token,
      estimatedCostMicroUsd: "600000",
      model: "openai/gpt-6",
    });

    expect(result.agent.id).toBe(agentId);
    expect(result.reservation.amountMicroUsd).toBe("600000");
  });

  it("returns stable codes for invalid identity and policy failures", async () => {
    await expect(
      authorizer.authorize({
        agentToken: "og_agent_invalid",
        estimatedCostMicroUsd: "1",
        model: "openai/gpt-6",
      }),
    ).rejects.toMatchObject({ code: "INVALID_AGENT_TOKEN" });

    await control.setStatus(agentId, "disabled");
    await expect(
      authorizer.authorize({
        agentToken: token,
        estimatedCostMicroUsd: "1",
        model: "openai/gpt-6",
      }),
    ).rejects.toMatchObject({ code: "AGENT_DISABLED" });
  });

  it("blocks requests that exceed remaining daily budget", async () => {
    await authorizer.authorize({
      agentToken: token,
      estimatedCostMicroUsd: "600000",
      model: "openai/gpt-6",
    });

    await expect(
      authorizer.authorize({
        agentToken: token,
        estimatedCostMicroUsd: "500000",
        model: "openai/gpt-6",
      }),
    ).rejects.toBeInstanceOf(GuardAuthorizationError);
    await expect(
      authorizer.authorize({
        agentToken: token,
        estimatedCostMicroUsd: "500000",
        model: "openai/gpt-6",
      }),
    ).rejects.toMatchObject({ code: "DAILY_BUDGET_EXCEEDED" });
  });
});
