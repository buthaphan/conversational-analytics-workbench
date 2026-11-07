import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { Clock } from "../time/clock";
import { type SessionEndReason, SessionCleanupRegistry } from "./session-cleanup";

const TOKEN_BYTES = 32;

/** The previous session could not be ended (its cleanup keeps failing), so no new one was created. */
export class SessionUnavailableError extends Error {
  constructor() {
    super("A new session could not be created because the previous one could not be ended.");
    this.name = "SessionUnavailableError";
  }
}

/** SHA-256 of a session token, hex-encoded. Only this hash is stored (AC-11). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuthenticatedSession {
  sessionId: string;
  user: { id: string; email: string };
}

/** Creates, validates, and ends authentication sessions according to the session rules (AC-5 to AC-9). */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly cleanup: SessionCleanupRegistry,
  ) {}

  /**
   * Starts a new session for the user, ending any existing one first (reason `replaced`).
   * Concurrent sign-ins race on the unique user_id; the loser ends the winner's session and retries,
   * so exactly one valid session remains (AC-5). Throws SessionUnavailableError if the previous
   * session cannot be cleaned up, rather than leaving two sessions.
   */
  async create(userId: string): Promise<{ token: string; sessionId: string }> {
    for (let attempt = 1; ; attempt++) {
      const existing = await this.prisma.authSession.findUnique({ where: { userId } });
      if (existing) await this.end(existing.id, "replaced");

      const token = randomBytes(TOKEN_BYTES).toString("base64url");
      const now = this.clock.now();
      try {
        const session = await this.prisma.authSession.create({
          data: {
            userId,
            tokenHash: hashToken(token),
            createdAt: now,
            lastActivityAt: now,
            expiresAt: new Date(now.getTime() + this.config.maxSessionMs),
          },
        });
        return { token, sessionId: session.id };
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!conflict) throw error;
        if (attempt >= 5) throw new SessionUnavailableError();
      }
    }
  }

  /** Ends the session that owns this token, if any (sign-out). Unknown or ended tokens are ignored. */
  async endByToken(token: string, reason: SessionEndReason): Promise<void> {
    if (!token) return;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (session) await this.end(session.id, reason);
  }

  /**
   * Returns the session's user and records the activity, or null when the token is unknown, ended,
   * idle for the timeout or longer, or past the 12-hour limit. Expired sessions are ended here.
   */
  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    if (!token) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!session || session.endedAt) return null;

    const now = this.clock.now();
    if (now.getTime() - session.lastActivityAt.getTime() >= this.config.idleTimeoutMs) {
      await this.end(session.id, "idle");
      return null;
    }
    if (now.getTime() >= session.expiresAt.getTime()) {
      await this.end(session.id, "max_age");
      return null;
    }

    // Only extend a session that has not ended meanwhile (for example by a concurrent sign-in).
    const touched = await this.prisma.authSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { lastActivityAt: now },
    });
    if (touched.count === 0) return null;
    return { sessionId: session.id, user: session.user };
  }

  /**
   * Ends a session. First marks it ended, so its token is rejected immediately. Then runs every
   * cleanup step and deletes the row in one transaction. If cleanup fails, the row stays marked
   * ended and the sweep retries. Safe to call for a session that no longer exists.
   */
  async end(sessionId: string, reason: SessionEndReason): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: this.clock.now(), endReason: reason },
    });
    await this.finishEnded(sessionId);
  }

  /** Runs cleanup and deletes an already-ended session. Returns false if cleanup failed. */
  async finishEnded(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the row so concurrent enders wait; whoever comes second finds it deleted and stops,
        // so cleanup steps run exactly once per session.
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
        const session = await tx.authSession.findUnique({ where: { id: sessionId } });
        if (!session?.endedAt) return;
        const reason = session.endReason as SessionEndReason;
        await this.cleanup.run({ sessionId, userId: session.userId, reason }, tx);
        await tx.authSession.delete({ where: { id: sessionId } });
        this.logger.log(`Session ended (reason: ${reason}).`);
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Session cleanup failed; the session stays ended and will be retried. ${(error as Error).name}`,
      );
      return false;
    }
  }
}
