import { type ArgumentsHost, Catch, HttpException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Request, Response } from "express";

/**
 * Unexpected errors are logged by their class name only (TASK-004 review S2). Nest's default
 * handler logs the message and stack, which for a database error can include the call's
 * arguments: user text or result rows. HTTP exceptions keep Nest's normal handling.
 */
@Catch()
export class SafeExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger("UnhandledError");

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException || host.getType() !== "http") {
      super.catch(exception, host);
      return;
    }
    const name = exception instanceof Error ? exception.name : typeof exception;
    // Method and route pattern only (for example "POST /api/analysis/messages"): no URL values,
    // query, or body.
    const request = host.switchToHttp().getRequest<Request>();
    const route = (request.route as { path?: string } | undefined)?.path ?? "(no route)";
    this.logger.error(`Unhandled error (${name}) in ${request.method} ${request.baseUrl}${route}.`);
    const response = host.switchToHttp().getResponse<Response>();
    if (!response.headersSent)
      response.status(500).json({ statusCode: 500, message: "Internal server error" });
  }
}
