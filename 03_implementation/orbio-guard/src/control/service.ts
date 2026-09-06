import {
  createAgentToken,
  createGuardAgent,
  hashAgentToken,
  validateModelPatterns,
  verifyAgentToken,
  type AgentStatus,
  type GuardAgent,
} from "../domain/agent.js";
import { parseMicroUsd } from "../domain/money.js";
import { appendLedgerEvent } from "../domain/ledger.js";
import type { GuardStateStore } from "../state/store.js";

export class GuardControlService {
  constructor(private readonly store: GuardStateStore) {}

  async addAgent(input: {
    allowedModels: string[];
    dailyBudgetMicroUsd: string;
    maxRequestMicroUsd?: string | null;
    name: string;
    project?: string | null;
  }) {
    if (!input.name.trim()) {
      throw new Error("Agent name is required.");
    }
    parseMicroUsd(input.dailyBudgetMicroUsd);
    if (input.maxRequestMicroUsd) {
      parseMicroUsd(input.maxRequestMicroUsd);
    }

    const created = createGuardAgent(input);
    await this.store.update((state) => {
      state.agents.push(created.agent);
      appendLedgerEvent(state, {
        agentId: created.agent.id,
        type: "AGENT_CREATED",
      });
    });
    return created;
  }

  async listAgents(): Promise<GuardAgent[]> {
    return (await this.store.read()).agents;
  }

  async getAgent(agentId: string): Promise<GuardAgent> {
    const agent = (await this.store.read()).agents.find(
      (candidate) => candidate.id === agentId,
    );
    if (!agent) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }
    return agent;
  }

  async authenticateAgent(token: string): Promise<GuardAgent> {
    const agent = (await this.store.read()).agents.find((candidate) =>
      verifyAgentToken(token, candidate.tokenHash),
    );
    if (!agent) {
      throw new InvalidAgentTokenError();
    }
    return agent;
  }

  async setStatus(agentId: string, status: AgentStatus): Promise<GuardAgent> {
    return this.updateAgent(agentId, "AGENT_STATUS_CHANGED", (agent) => {
      agent.status = status;
    });
  }

  async rotateToken(agentId: string): Promise<{ agent: GuardAgent; token: string }> {
    const token = createAgentToken();
    const agent = await this.updateAgent(agentId, "AGENT_TOKEN_ROTATED", (current) => {
      current.tokenHash = hashAgentToken(token);
    });
    return { agent, token };
  }

  async updatePolicy(
    agentId: string,
    policy: {
      allowedModels?: string[];
      dailyBudgetMicroUsd?: string;
      maxRequestMicroUsd?: string | null;
    },
  ): Promise<GuardAgent> {
    if (policy.allowedModels) {
      validateModelPatterns(policy.allowedModels);
    }
    if (policy.dailyBudgetMicroUsd) {
      parseMicroUsd(policy.dailyBudgetMicroUsd);
    }
    if (policy.maxRequestMicroUsd) {
      parseMicroUsd(policy.maxRequestMicroUsd);
    }

    return this.updateAgent(agentId, "POLICY_UPDATED", (agent) => {
      if (policy.allowedModels) {
        agent.allowedModels = [...new Set(policy.allowedModels)];
      }
      if (policy.dailyBudgetMicroUsd) {
        agent.dailyBudgetMicroUsd = policy.dailyBudgetMicroUsd;
      }
      if (policy.maxRequestMicroUsd !== undefined) {
        agent.maxRequestMicroUsd = policy.maxRequestMicroUsd;
      }
    });
  }

  private async updateAgent(
    agentId: string,
    eventType:
      | "AGENT_STATUS_CHANGED"
      | "AGENT_TOKEN_ROTATED"
      | "POLICY_UPDATED",
    update: (agent: GuardAgent) => void,
  ): Promise<GuardAgent> {
    return this.store.update((state) => {
      const agent = state.agents.find((candidate) => candidate.id === agentId);
      if (!agent) {
        throw new Error(`Agent "${agentId}" was not found.`);
      }
      update(agent);
      agent.updatedAt = new Date().toISOString();
      appendLedgerEvent(state, { agentId, type: eventType });
      return structuredClone(agent);
    });
  }
}

export class InvalidAgentTokenError extends Error {
  readonly code = "INVALID_AGENT_TOKEN";

  constructor() {
    super("The Guard agent token is invalid.");
  }
}
