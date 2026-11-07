import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { AppConfig } from "../config/config";
import { APP_CONFIG } from "../config/config.module";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection alongside SameSite=Strict cookies (AC-11): a state-changing request must carry an
 * Origin header equal to APP_ORIGIN. Runs before validation, so a rejected request changes nothing.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers.origin === this.config.appOrigin) return true;
    throw new ForbiddenException({ message: "Request origin not allowed." });
  }
}
