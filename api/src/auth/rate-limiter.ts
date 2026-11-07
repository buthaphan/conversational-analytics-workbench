import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/client";
import { Clock } from "../time/clock";

/** Sign-in limits (DEC-006): failures within the window per email and per client IP. */
export const EMAIL_FAILURE_LIMIT = 5;
export const IP_FAILURE_LIMIT = 20;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type RateLimitResult = { blocked: false } | { blocked: true; retryAfterSeconds: number };
export type Reservation =
  { blocked: false; attemptId: bigint } | { blocked: true; retryAfterSeconds: number };

/** Counts failed sign-ins in PostgreSQL, so limits survive restarts and work across instances. */
@Injectable()
export class RateLimiter {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {}

  /**
   * Records the attempt first, then counts attempts in the window including this one (review R1).
   * Because every attempt is stored before anyone counts, a burst of simultaneous attempts cannot all
   * see a count under the limit: only the first EMAIL_FAILURE_LIMIT (or IP_FAILURE_LIMIT) can proceed
   * to a password check. A blocked attempt removes its own record, so being blocked never extends the
   * block. The caller keeps the record on a wrong password and clears the email's records on success.
   */
  async reserve(email: string, clientIp: string): Promise<Reservation> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
    const attempt = await this.prisma.signInAttempt.create({
      data: { email, clientIp, attemptedAt: now },
      select: { id: true },
    });
    const [emailCount, ipCount] = await Promise.all([
      this.prisma.signInAttempt.count({ where: { email, attemptedAt: { gt: since } } }),
      this.prisma.signInAttempt.count({ where: { clientIp, attemptedAt: { gt: since } } }),
    ]);
    if (emailCount <= EMAIL_FAILURE_LIMIT && ipCount <= IP_FAILURE_LIMIT) {
      return { blocked: false, attemptId: attempt.id };
    }

    await this.prisma.signInAttempt.delete({ where: { id: attempt.id } });
    const limit = await this.check(email, clientIp);
    // Other attempts may have been cleared meanwhile (a success); still refuse this one briefly.
    return { blocked: true, retryAfterSeconds: limit.blocked ? limit.retryAfterSeconds : 1 };
  }

  /** Whether the email or IP is currently over its limit, and for how long. */
  async check(email: string, clientIp: string): Promise<RateLimitResult> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
    const results = await Promise.all([
      this.oldestWhenOverLimit({ email, attemptedAt: { gt: since } }, EMAIL_FAILURE_LIMIT),
      this.oldestWhenOverLimit({ clientIp, attemptedAt: { gt: since } }, IP_FAILURE_LIMIT),
    ]);
    // Blocked until the oldest counted failure leaves the window (the longest wait applies).
    const unblockAt = results
      .filter((oldest): oldest is Date => oldest !== null)
      .map((oldest) => oldest.getTime() + RATE_LIMIT_WINDOW_MS);
    if (unblockAt.length === 0) return { blocked: false };
    const retryAfterSeconds = Math.ceil((Math.max(...unblockAt) - now.getTime()) / 1000);
    return { blocked: true, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  /** A successful sign-in clears that email's attempts, including its own reservation (not the IP's). */
  async clearEmail(email: string): Promise<void> {
    await this.prisma.signInAttempt.deleteMany({ where: { email } });
  }

  /**
   * When at least `limit` failures match, returns the time of the oldest failure that still keeps the
   * count at the limit (the (count - limit + 1)-th oldest); otherwise null.
   */
  private async oldestWhenOverLimit(
    where: { email?: string; clientIp?: string; attemptedAt: { gt: Date } },
    limit: number,
  ): Promise<Date | null> {
    const count = await this.prisma.signInAttempt.count({ where });
    if (count < limit) return null;
    const row = await this.prisma.signInAttempt.findFirst({
      where,
      orderBy: { attemptedAt: "asc" },
      skip: count - limit,
      select: { attemptedAt: true },
    });
    return row?.attemptedAt ?? null;
  }
}
