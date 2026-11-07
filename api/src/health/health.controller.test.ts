import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_OPTIONS, configureApp } from "../app";
import { HealthModule } from "./health.module";

describe("GET /api/health (AC-1)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports that the API is up", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("only serves routes under /api", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(404);
  });
});
