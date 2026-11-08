import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultEngine } from "./analysis/engine/result-engine";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
} from "./test/app";

/**
 * Review S2 (TASK-004 DEC-005): an unexpected error is logged by its class name only, never its
 * message (which could carry user text or result rows), and the client gets a generic 500.
 */
describe("unexpected errors (TASK-004 review S2)", () => {
  let t: TestApp;
  const SECRET = "PRIVATE-row-Ada-Park-1234.50";

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    vi.restoreAllMocks();
    await createUser(t.prisma, "user@example.test", "pw-123456");
  });

  it("logs only the error class name and answers with a generic 500", async () => {
    const http = () => request(t.app.getHttpServer());
    const signIn = await http()
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send({ email: "user@example.test", password: "pw-123456" });
    const token = sessionCookie(signIn) as string;

    class SampleFailure extends Error {
      override name = "SampleFailure";
    }
    vi.spyOn(t.app.get(ResultEngine), "view").mockRejectedValueOnce(new SampleFailure(SECRET));
    const written: string[] = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(capture);
    vi.spyOn(process.stderr, "write").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation((...args) => void written.push(args.join(" ")));

    const response = await http()
      .post("/api/analysis/messages")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send({ text: "The previous calendar year" });
    vi.restoreAllMocks();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: "Internal server error" });
    const log = written.join("\n");
    expect(log).toContain("SampleFailure");
    // The method and route pattern help tracing; the URL's values and the body are not logged.
    expect(log).toContain("POST /api/analysis/messages");
    expect(log).not.toContain(SECRET);
  });
});
