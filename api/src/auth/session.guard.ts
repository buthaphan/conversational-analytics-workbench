import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { type AuthenticatedSession, SessionStore } from "../sessions/session.store";
import { clearSessionCookie, readSessionToken } from "./session-cookie";

export type AuthenticatedRequest = Request & { auth: AuthenticatedSession };

/** Allows a request only with a valid session; clears the cookie when the session is gone (AC-6, AC-7). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const token = readSessionToken(request, this.config);
    const auth = token ? await this.sessions.authenticate(token) : null;
    if (!auth) {
      if (token) clearSessionCookie(http.getResponse<Response>(), this.config);
      throw new UnauthorizedException({ message: "Your session has ended. Sign in again." });
    }
    (request as AuthenticatedRequest).auth = auth;
    return true;
  }
}
