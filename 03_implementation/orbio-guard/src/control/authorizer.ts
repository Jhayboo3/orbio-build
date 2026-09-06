import {
  BudgetExceededError,
  type BudgetReservation,
  type BudgetService,
} from "../domain/budget.js";
import type { GuardAgent } from "../domain/agent.js";
import {
  evaluateStaticPolicy,
  type PolicyReasonCode,
} from "../domain/policy.js";
import {
  GuardControlService,
  InvalidAgentTokenError,
} from "./service.js";
import type { LedgerService } from "../domain/ledger.js";

export type AuthorizationFailureCode =
  | "INVALID_AGENT_TOKEN"
  | "DAILY_BUDGET_EXCEEDED"
  | PolicyReasonCode;

export class GuardAuthorizationError extends Error {
  constructor(
    readonly code: AuthorizationFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthorizedRequest {
  agent: GuardAgent;
  reservation: BudgetReservation;
}

export class GuardRequestAuthorizer {
  constructor(
    private readonly control: GuardControlService,
    private readonly budgets: BudgetService,
    private readonly ledger?: LedgerService,
  ) {}

  async authorize(input: {
    agentToken: string;
    estimatedCostMicroUsd: string;
    model: string;
    requestId?: string;
  }): Promise<AuthorizedRequest> {
    let agent: GuardAgent;
    try {
      agent = await this.control.authenticateAgent(input.agentToken);
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        await this.ledger?.record({
          model: input.model,
          reasonCode: error.code,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          type: "REQUEST_BLOCKED",
        });
        throw new GuardAuthorizationError(error.code, error.message);
      }
      throw error;
    }

    const decision = evaluateStaticPolicy(agent, input);
    if (!decision.allowed) {
      await this.ledger?.record({
        agentId: agent.id,
        model: input.model,
        reasonCode: decision.code,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        type: "REQUEST_BLOCKED",
      });
      throw new GuardAuthorizationError(decision.code, decision.message);
    }

    try {
      const reservation = await this.budgets.reserve({
        agentId: agent.id,
        amountMicroUsd: input.estimatedCostMicroUsd,
        dailyLimitMicroUsd: agent.dailyBudgetMicroUsd,
      });
      try {
        await this.ledger?.record({
          agentId: agent.id,
          amountMicroUsd: input.estimatedCostMicroUsd,
          model: input.model,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          type: "REQUEST_ALLOWED",
        });
      } catch (error) {
        await this.budgets.release(reservation.id);
        throw error;
      }
      return { agent, reservation };
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        await this.ledger?.record({
          agentId: agent.id,
          amountMicroUsd: input.estimatedCostMicroUsd,
          model: input.model,
          reasonCode: error.code,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          type: "REQUEST_BLOCKED",
        });
        throw new GuardAuthorizationError(error.code, error.message);
      }
      throw error;
    }
  }
}
