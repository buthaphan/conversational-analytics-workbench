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
  private readonly steps: SessionCleanupStep[] = [];

  register(step: SessionCleanupStep): void {
    this.steps.push(step);
  }

  async run(context: SessionCleanupContext, tx: Prisma.TransactionClient): Promise<void> {
    for (const step of this.steps) {
      await step(context, tx);
    }
  }
}
