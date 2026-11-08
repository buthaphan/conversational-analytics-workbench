import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** Why an authentication session ended. */
export type SessionEndReason = "sign_out" | "replaced" | "idle" | "max_age";

export interface SessionCleanupContext {
  sessionId: string;
  userId: string;
  reason: SessionEndReason;
}

/**
 * Deletes data owned by an ending session (for example TASK-003's analysis session and results).
 * Runs inside the transaction that deletes the session; throwing rolls both back, and the sweep retries.
 */
export type SessionCleanupStep = (
  context: SessionCleanupContext,
  tx: Prisma.TransactionClient,
) => Promise<void>;

/** The single session-end cleanup point (AC-9). Feature modules register their steps here. */
@Injectable()
export class SessionCleanupRegistry {
  private readonly steps: { name: string; step: SessionCleanupStep }[] = [];

  /** Adds a step; steps run in registration order. The name identifies it in tests and logs. */
  register(step: SessionCleanupStep, name = "unnamed"): void {
    this.steps.push({ name, step });
  }

  registeredNames(): string[] {
    return this.steps.map((s) => s.name);
  }

  async run(context: SessionCleanupContext, tx: Prisma.TransactionClient): Promise<void> {
    for (const { step } of this.steps) {
      await step(context, tx);
    }
  }
}
