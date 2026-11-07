import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/client";
import { SessionStore } from "../sessions/session.store";
import { PasswordService } from "./password.service";
import { RateLimiter } from "./rate-limiter";

export const INVALID_CREDENTIALS = "Email or password is incorrect.";
export const TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Try again later.";

/** Lowercase, trimmed email: the stored form (AC-2, AC-4). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sign-in refused by the rate limit (AC-10). */
export class SignInRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(TOO_MANY_ATTEMPTS);
    this.name = "SignInRateLimitedError";
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionStore,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Checks the rate limit, then the credentials, and starts a session. Unknown email and wrong
   * password fail identically and both count as failures.
   */
  async signIn(
    email: string,
    password: string,
    clientIp: string,
  ): Promise<{ token: string; email: string }> {
    const normalized = normalizeEmail(email);
    // Recorded before the password check, so simultaneous guesses cannot all slip under the limit.
    const reservation = await this.limiter.reserve(normalized, clientIp);
    if (reservation.blocked) {
      this.logger.warn("Sign-in refused by rate limit.");
      throw new SignInRateLimitedError(reservation.retryAfterSeconds);
    }

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const valid = user
      ? await this.passwords.verify(password, user.passwordHash)
      : await this.passwords.verifyAgainstDummy(password);

    if (!user || !valid) {
      // The reservation stays as the recorded failure.
      this.logger.log("Sign-in failed.");
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS });
    }

    await this.limiter.clearEmail(normalized);
    const { token } = await this.sessions.create(user.id);
    this.logger.log("Sign-in succeeded.");
    return { token, email: user.email };
  }
}
