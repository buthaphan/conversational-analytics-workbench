import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";
import { SessionStore } from "../sessions/session.store";
import { AuthService, SignInRateLimitedError } from "./auth.service";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie";
import { SignInDto } from "./sign-in.dto";

interface UserResponse {
  user: { email: string };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post("sign-in")
  @HttpCode(200)
  async signIn(
    @Body() body: SignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    try {
      const { token, email } = await this.auth.signIn(
        body.email,
        body.password,
        request.ip ?? "unknown",
      );
      setSessionCookie(response, this.config, token);
      return { user: { email } };
    } catch (error) {
      if (error instanceof SignInRateLimitedError) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
        throw new HttpException({ message: error.message }, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  /** Current session. Also the keep-alive: any authenticated request counts as activity. */
  @Get("session")
  @UseGuards(SessionGuard)
  current(@Req() request: AuthenticatedRequest): UserResponse {
    return { user: { email: request.auth.user.email } };
  }

  @Post("sign-out")
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readSessionToken(request, this.config);
    if (token) await this.sessions.endByToken(token, "sign_out");
    clearSessionCookie(response, this.config);
  }
}
