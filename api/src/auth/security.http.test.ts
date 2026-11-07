import { Logger } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "../sessions/session.store";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
  sessionCookieHeader,
} from "../test/app";
import { PasswordService } from "./password.service";

const credentials = { email: "user@example.test", password: "right-password" };

describe("request security (AC-11)", () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    vi.restoreAllMocks();
    await createUser(t.prisma, credentials.email, credentials.password);
  });

  describe("Origin check on POST", () => {
    it.each([
      ["missing", undefined],
      ["from another site", "https://evil.example"],
      ["a different port", "http://localhost:9999"],
      ["the literal null", "null"],
    ])("rejects sign-in with an Origin that is %s, changing nothing", async (_, origin) => {
      const req = http().post("/api/auth/sign-in").send(credentials);
      const response = await (origin === undefined ? req : req.set("Origin", origin));
      expect(response.status).toBe(403);
      expect(sessionCookie(response)).toBeUndefined();
      expect(await t.prisma.authSession.count()).toBe(0);
      expect(await t.prisma.signInAttempt.count()).toBe(0);
    });

    it("rejects sign-out from another origin and keeps the session", async () => {
      const token = sessionCookie(
        await http().post("/api/auth/sign-in").set("Origin", TEST_ORIGIN).send(credentials),
      );
      const response = await http()
        .post("/api/auth/sign-out")
        .set("Origin", "https://evil.example")
        .set("Cookie", `cawb_session=${token}`);
      expect(response.status).toBe(403);
      const check = await http().get("/api/auth/session").set("Cookie", `cawb_session=${token}`);
      expect(check.status).toBe(200);
    });

    it("does not require an Origin on GET requests", async () => {
      expect((await http().get("/api/health")).status).toBe(200);
    });
  });

  describe("session cookie", () => {
    it("is HttpOnly, SameSite=Strict, Path=/, with no Max-Age or Secure on local HTTP", async () => {
      const header = sessionCookieHeader(
        await http().post("/api/auth/sign-in").set("Origin", TEST_ORIGIN).send(credentials),
      );
      expect(header).toBeDefined();
      const attributes = header!
        .split(";")
        .slice(1)
        .map((a) => a.trim().toLowerCase());
      expect(attributes).toEqual(expect.arrayContaining(["path=/", "httponly", "samesite=strict"]));
      expect(attributes.some((a) => a.startsWith("max-age") || a.startsWith("expires"))).toBe(
        false,
      );
      expect(attributes).not.toContain("secure");
    });

    it("adds Secure and the __Host- prefix when COOKIE_SECURE=true", async () => {
      const secure = await createTestApp({ COOKIE_SECURE: "true" });
      try {
        const response = await request(secure.app.getHttpServer())
          .post("/api/auth/sign-in")
          .set("Origin", TEST_ORIGIN)
          .send(credentials);
        const header = sessionCookieHeader(response, "__Host-cawb_session");
        expect(header).toBeDefined();
        expect(header!.toLowerCase()).toContain("; secure");
        expect(sessionCookie(response)).toBeUndefined();
      } finally {
        await secure.close();
      }
    });
  });

  it("sends Cache-Control: no-store on every auth response, including errors", async () => {
    const ok = await http().post("/api/auth/sign-in").set("Origin", TEST_ORIGIN).send(credentials);
    const token = sessionCookie(ok);
    const responses = [
      ok,
      await http()
        .post("/api/auth/sign-in")
        .set("Origin", TEST_ORIGIN)
        .send({ ...credentials, password: "wrong" }),
      await http().post("/api/auth/sign-in").set("Origin", TEST_ORIGIN).send({}),
      await http().get("/api/auth/session").set("Cookie", `cawb_session=${token}`),
      await http().get("/api/auth/session"),
      await http().post("/api/auth/sign-out").set("Origin", TEST_ORIGIN),
    ];
    for (const response of responses) {
      expect(response.headers["cache-control"], `${response.status}`).toBe("no-store");
    }
  });

  it("rejects bodies over 10 kB with 413 without checking a password", async () => {
    const verify = vi.spyOn(t.app.get(PasswordService), "verify");
    const response = await http()
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send({ email: credentials.email, password: "x".repeat(11 * 1024) });
    expect(response.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });

  describe("logs", () => {
    let output: string[];

    beforeEach(() => {
      output = [];
      const capture = (...parts: unknown[]) => {
        output.push(
          parts.map((p) => (p instanceof Error ? `${p.message}\n${p.stack}` : String(p))).join(" "),
        );
        return true;
      };
      // Nest's testing logger drops everything below "error"; record every level instead.
      Logger.overrideLogger({
        log: capture,
        error: capture,
        warn: capture,
        debug: capture,
        verbose: capture,
        fatal: capture,
      });
      vi.spyOn(process.stdout, "write").mockImplementation(capture);
      vi.spyOn(process.stderr, "write").mockImplementation(capture);
      vi.spyOn(console, "log").mockImplementation(capture);
      vi.spyOn(console, "error").mockImplementation(capture);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      Logger.overrideLogger(["error"]);
    });

    it("never contain passwords, tokens, token hashes, or password hashes", async () => {
      const post = (path: string) => http().post(path).set("Origin", TEST_ORIGIN);
      const signedIn = await post("/api/auth/sign-in").send(credentials);
      const token = sessionCookie(signedIn)!;
      await post("/api/auth/sign-in").send({ ...credentials, password: "wrong-password-xyz" });
      await post("/api/auth/sign-in").send({
        email: "nobody@example.test",
        password: "pw-unknown",
      });
      await http().get("/api/auth/session").set("Cookie", `cawb_session=${token}`);
      await post("/api/auth/sign-out").set("Cookie", `cawb_session=${token}`);
      t.clock.advance(11 * 60 * 1000);
      await http().get("/api/auth/session").set("Cookie", `cawb_session=${token}`);

      const { passwordHash } = await t.prisma.user.findUniqueOrThrow({
        where: { email: credentials.email },
      });
      const logs = output.join("\n");
      expect(logs).toContain("Sign-in");
      for (const secret of [
        credentials.password,
        "wrong-password-xyz",
        "pw-unknown",
        token,
        hashToken(token),
        passwordHash,
      ]) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});
