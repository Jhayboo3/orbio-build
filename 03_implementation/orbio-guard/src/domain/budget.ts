import { randomUUID } from "node:crypto";
import type { GuardStateStore } from "../state/store.js";
import { parseMicroUsd } from "./money.js";
import { appendLedgerEvent } from "./ledger.js";

export class BudgetExceededError extends Error {
  readonly code = "DAILY_BUDGET_EXCEEDED";
}

export interface BudgetReservation {
  amountMicroUsd: string;
  date: string;
  id: string;
}

export interface ReservationRecoveryResult {
  amountMicroUsd: string;
  recovered: number;
}

export class BudgetService {
  constructor(
    private readonly store: GuardStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(input: {
    agentId: string;
    amountMicroUsd: string;
    dailyLimitMicroUsd: string;
  }): Promise<BudgetReservation> {
    return this.store.update((state) => {
      const date = utcDate(this.now());
      const budget = getOrCreateBudget(state, input.agentId, date);
      const reserved = budget.reservations.reduce(
        (total, reservation) => total + parseMicroUsd(reservation.amountMicroUsd),
        0n,
      );
      const nextAmount = parseMicroUsd(input.amountMicroUsd);
      const used = parseMicroUsd(budget.confirmedMicroUsd) + reserved;

      if (used + nextAmount > parseMicroUsd(input.dailyLimitMicroUsd)) {
        throw new BudgetExceededError("Daily budget does not have enough remaining credit.");
      }

      const reservation = {
        id: randomUUID(),
        amountMicroUsd: input.amountMicroUsd,
        createdAt: this.now().toISOString(),
      };
      budget.reservations.push(reservation);
      appendLedgerEvent(state, {
        agentId: input.agentId,
        amountMicroUsd: input.amountMicroUsd,
        type: "BUDGET_RESERVED",
      });

      return { ...reservation, date };
    });
  }

  async confirm(reservationId: string, confirmedMicroUsd: string): Promise<void> {
    await this.store.update((state) => {
      const located = findReservation(state, reservationId);
      if (!located) {
        throw new Error(`Budget reservation "${reservationId}" was not found.`);
      }

      located.budget.reservations.splice(located.index, 1);
      located.budget.confirmedMicroUsd = (
        parseMicroUsd(located.budget.confirmedMicroUsd) +
        parseMicroUsd(confirmedMicroUsd)
      ).toString();
      appendLedgerEvent(state, {
        agentId: located.budget.agentId,
        amountMicroUsd: confirmedMicroUsd,
        type: "SPEND_CONFIRMED",
      });
    });
  }

  async release(reservationId: string): Promise<void> {
    await this.store.update((state) => {
      const located = findReservation(state, reservationId);
      if (!located) {
        return;
      }

      located.budget.reservations.splice(located.index, 1);
      appendLedgerEvent(state, {
        agentId: located.budget.agentId,
        amountMicroUsd: located.reservation.amountMicroUsd,
        type: "RESERVATION_RELEASED",
      });
    });
  }

  async usage(agentId: string): Promise<{
    confirmedMicroUsd: string;
    date: string;
    reservedMicroUsd: string;
  }> {
    const state = await this.store.read();
    const date = utcDate(this.now());
    const budget = state.budgets.find(
      (entry) => entry.agentId === agentId && entry.date === date,
    );

    return {
      confirmedMicroUsd: budget?.confirmedMicroUsd ?? "0",
      date,
      reservedMicroUsd: (
        budget?.reservations.reduce(
          (total, reservation) => total + parseMicroUsd(reservation.amountMicroUsd),
          0n,
        ) ?? 0n
      ).toString(),
    };
  }

  async recoverStaleReservations(input: {
    maxAgeMs: number;
    policy: "confirm" | "release";
  }): Promise<ReservationRecoveryResult> {
    return this.store.update((state) => {
      const now = this.now();
      let recovered = 0;
      let amount = 0n;

      for (const budget of state.budgets) {
        const retained = [];
        for (const reservation of budget.reservations) {
          const age = now.getTime() - new Date(reservation.createdAt).getTime();
          if (age < input.maxAgeMs) {
            retained.push(reservation);
            continue;
          }

          const reservationAmount = parseMicroUsd(reservation.amountMicroUsd);
          recovered += 1;
          amount += reservationAmount;
          if (input.policy === "confirm") {
            budget.confirmedMicroUsd = (
              parseMicroUsd(budget.confirmedMicroUsd) + reservationAmount
            ).toString();
          }
          appendLedgerEvent(
            state,
            {
              agentId: budget.agentId,
              amountMicroUsd: reservation.amountMicroUsd,
              reasonCode:
                input.policy === "confirm"
                  ? "STALE_RESERVATION_CONFIRMED"
                  : "STALE_RESERVATION_RELEASED",
              type: "RESERVATION_RECOVERED",
            },
            now,
          );
        }
        budget.reservations = retained;
      }

      return { amountMicroUsd: amount.toString(), recovered };
    });
  }
}

function getOrCreateBudget(
  state: Awaited<ReturnType<GuardStateStore["read"]>>,
  agentId: string,
  date: string,
) {
  let budget = state.budgets.find(
    (entry) => entry.agentId === agentId && entry.date === date,
  );

  if (!budget) {
    budget = {
      agentId,
      date,
      confirmedMicroUsd: "0",
      reservations: [],
    };
    state.budgets.push(budget);
  }

  return budget;
}

function findReservation(
  state: Awaited<ReturnType<GuardStateStore["read"]>>,
  reservationId: string,
) {
  for (const budget of state.budgets) {
    const index = budget.reservations.findIndex(
      (reservation) => reservation.id === reservationId,
    );
    if (index >= 0) {
      return { budget, index, reservation: budget.reservations[index]! };
    }
  }

  return undefined;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
