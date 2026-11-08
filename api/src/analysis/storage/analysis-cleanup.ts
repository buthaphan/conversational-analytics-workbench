import { Injectable, type OnModuleInit } from "@nestjs/common";
import { SessionCleanupRegistry } from "../../sessions/session-cleanup";

export const ANALYSIS_CLEANUP_STEP_NAME = "analysis-data";

/**
 * Deletes the ending login session's analysis data (session, messages, result sets, rows) inside the
 * session-end transaction (TASK-003 AC-1). The database cascades from auth_sessions and users are a
 * second safety net; this step makes the cleanup explicit and runs before the session row is deleted.
 * One indexed delete with cascades: fast enough for the default 5-second transaction timeout.
 */
@Injectable()
export class AnalysisCleanup implements OnModuleInit {
  constructor(private readonly registry: SessionCleanupRegistry) {}

  onModuleInit(): void {
    this.registry.register(async ({ sessionId }, tx) => {
      await tx.analysisSession.deleteMany({ where: { authSessionId: sessionId } });
    }, ANALYSIS_CLEANUP_STEP_NAME);
  }
}
