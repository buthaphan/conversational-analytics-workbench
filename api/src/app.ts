import { ValidationPipe } from "@nestjs/common";
import type { NestApplicationOptions } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { SafeExceptionFilter } from "./common/safe-exception.filter";

type SetHeader = (name: string, value: string) => void;

/**
 * Options for creating the application. Nest's default body parsers are off, so only the JSON parser
 * registered in configureApp exists: form-encoded and other bodies stay unparsed and fail validation.
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** Applies settings shared by the running server and HTTP tests. */
export function configureApp<T extends NestExpressApplication>(app: T): T {
  app.setGlobalPrefix("api");
  // Behind the web container's nginx (or Vite's dev proxy), the client IP for rate limiting comes from
  // X-Forwarded-For, trusted only from loopback and private-network proxies.
  app.set("trust proxy", "loopback, uniquelocal");
  // Auth and analysis responses (including errors) must never be cached by the browser or a proxy
  // (TASK-001 AC-11, TASK-003 AC-12).
  app.use(
    ["/api/auth", "/api/analysis"],
    (_request: unknown, response: { setHeader: SetHeader }, next: () => void) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    },
  );
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "10kb" });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Unexpected errors are logged by class name only (TASK-004 review S2).
  app.useGlobalFilters(new SafeExceptionFilter(app.getHttpAdapter()));
  return app;
}
