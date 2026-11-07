import type { CookieOptions, Request, Response } from "express";
import type { AppConfig } from "../config/config";

/**
 * Session cookie (AC-11): HttpOnly, SameSite=Strict, Path=/, no Max-Age (ends with the browser
 * session). With COOKIE_SECURE it is also Secure and uses the __Host- prefix.
 */
export function sessionCookieName(config: AppConfig): string {
  return config.cookieSecure ? "__Host-cawb_session" : "cawb_session";
}

function options(config: AppConfig): CookieOptions {
  return { httpOnly: true, sameSite: "strict", path: "/", secure: config.cookieSecure };
}

export function readSessionToken(request: Request, config: AppConfig): string | undefined {
  const value: unknown = request.cookies?.[sessionCookieName(config)];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setSessionCookie(response: Response, config: AppConfig, token: string): void {
  response.cookie(sessionCookieName(config), token, options(config));
}

export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.clearCookie(sessionCookieName(config), options(config));
}
