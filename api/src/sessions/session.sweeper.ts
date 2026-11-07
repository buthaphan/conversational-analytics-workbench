import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { PrismaClient } from "../generated/prisma/client";
import { Clock } from "../time/clock";
import { SessionStore } from "./session.store";

export const SWEEP_INTERVAL_MS = 60 * 1000;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Ends sessions nobody is using any more (closed browsers), retries unfinished cleanups, and drops old
 * sign-in attempts. Runs on start and every 60 seconds, so an abandoned session is deleted within
 * 11 minutes of its last activity (AC-9).
 */
@Injectable()
export class SessionSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly sessions: SessionStore,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Automated tests drive sweep() directly with a fake clock; a background timer would race them.
    if (this.config.nodeEnv === "test") return;
    await this.runSafely();
    this.timer = setInterval(() => void this.runSafely(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async sweep(): Promise<void> {
    const now = this.clock.now();
    const idleSince = new Date(now.getTime() - this.config.idleTimeoutMs);

    const expired = await this.prisma.authSession.findMany({
      where: {
        endedAt: null,
        OR: [{ lastActivityAt: { lte: idleSince } }, { expiresAt: { lte: now } }],
      },
      select: { id: true, lastActivityAt: true },
    });
    for (const session of expired) {
      await this.sessions.end(session.id, session.lastActivityAt <= idleSince ? "idle" : "max_age");
    }

    const unfinished = await this.prisma.authSession.findMany({
      where: { endedAt: { not: null } },
      select: { id: true },
    });
    for (const session of unfinished) {
      await this.sessions.finishEnded(session.id);
    }

    await this.prisma.signInAttempt.deleteMany({
      where: { attemptedAt: { lt: new Date(now.getTime() - ATTEMPT_RETENTION_MS) } },
    });
  }

  /** One sweep at a time; a failure is logged and the next run tries again. */
  private async runSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error(`Session sweep failed: ${(error as Error).name}`);
    } finally {
      this.running = false;
    }
  }
}
