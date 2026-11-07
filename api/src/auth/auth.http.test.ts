import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const minute = 60 * 1000;
const GENERIC = "Email or password is incorrect.";

describe("auth HTTP API (AC-4 to AC-8)", () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const signIn = (body: unknown) =>
    http()
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send(body as object);
  const session = (token?: string) => {
    const req = http().get("/api/auth/session");
    return token === undefined ? req : req.set("Cookie", `cawb_session=${token}`);
  };
  const signOut = (token?: string) => {
    const req = http().post("/api/auth/sign-out").set("Origin", TEST_ORIGIN);
    return token === undefined ? req : req.set("Cookie", `cawb_session=${token}`);
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    vi.restoreAllMocks();
    await createUser(t.prisma, "user@example.test", "right-password");
  });

  describe("POST /api/auth/sign-in (AC-4)", () => {
    it("signs in, creates a session, and sets the cookie", async () => {
      const response = await signIn({ email: "user@example.test", password: "right-password" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user: { email: "user@example.test" } });
      expect(sessionCookie(response)).toBeTruthy();
      expect(await t.prisma.authSession.count()).toBe(1);
    });

    it("trims the email and ignores letter case", async () => {
      const response = await signIn({ email: "  User@Example.TEST ", password: "right-password" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user: { email: "user@example.test" } });
    });

    it("gives the same 401 for a wrong password and an unknown email", async () => {
      const wrong = await signIn({ email: "user@example.test", password: "wrong" });
      const unknown = await signIn({ email: "nobody@example.test", password: "wrong" });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual({ message: GENERIC });
      expect(unknown.body).toEqual(wrong.body);
      expect(sessionCookie(wrong)).toBeUndefined();
      expect(await t.prisma.authSession.count()).toBe(0);
    });

    it("still runs a password check for an unknown email", async () => {
      const verify = vi.spyOn(t.app.get(PasswordService), "verify");
      await signIn({ email: "nobody@example.test", password: "wrong" });
      expect(verify).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["missing email", { password: "x" }],
      ["invalid email", { email: "not-an-email", password: "x" }],
      ["email over 254 characters", { email: `${"a".repeat(250)}@x.test`, password: "x" }],
      ["empty password", { email: "user@example.test", password: "" }],
      [
        "password over 1,024 characters",
        { email: "user@example.test", password: "x".repeat(1025) },
      ],
      ["non-string password", { email: "user@example.test", password: 123 }],
      ["extra field", { email: "user@example.test", password: "x", admin: true }],
    ])("returns 400 for %s without checking a password", async (_, body) => {
      const verify = vi.spyOn(t.app.get(PasswordService), "verify");
      const response = await signIn(body);
      expect(response.status).toBe(400);
      expect(verify).not.toHaveBeenCalled();
    });

    it.each(["text/plain", "application/x-www-form-urlencoded"])(
      "returns 400 for a %s body (JSON only)",
      async (contentType) => {
        const verify = vi.spyOn(t.app.get(PasswordService), "verify");
        const response = await http()
          .post("/api/auth/sign-in")
          .set("Origin", TEST_ORIGIN)
          .set("Content-Type", contentType)
          .send("email=user%40example.test&password=right-password");
        expect(response.status).toBe(400);
        expect(verify).not.toHaveBeenCalled();
      },
    );
  });

  describe("one session per user (AC-5)", () => {
    it("ends the previous session when the user signs in again", async () => {
      const first = sessionCookie(
        await signIn({ email: "user@example.test", password: "right-password" }),
      );
      const second = sessionCookie(
        await signIn({ email: "user@example.test", password: "right-password" }),
      );
      expect((await session(first)).status).toBe(401);
      expect((await signOut(first)).status).toBe(204);
      expect((await session(second)).status).toBe(200);
      expect(await t.prisma.authSession.count()).toBe(1);
    });

    it("leaves exactly one valid session after concurrent sign-ins", async () => {
      const body = { email: "user@example.test", password: "right-password" };
      const responses = await Promise.all([signIn(body), signIn(body), signIn(body)]);
      const tokens = responses.map((r) => sessionCookie(r)).filter(Boolean) as string[];
      const valid = [];
      for (const token of tokens) if ((await session(token)).status === 200) valid.push(token);
      expect(valid).toHaveLength(1);
      expect(await t.prisma.authSession.count()).toBe(1);
    });
  });

  describe("GET /api/auth/session (AC-6, AC-7)", () => {
    let token: string;

    beforeEach(async () => {
      token = sessionCookie(
        await signIn({ email: "user@example.test", password: "right-password" }),
      )!;
    });

    it("returns the user for a valid session, repeatedly (refresh keeps the session)", async () => {
      for (let i = 0; i < 3; i++) {
        const response = await session(token);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ user: { email: "user@example.test" } });
      }
    });

    it.each([
      ["no cookie", undefined],
      ["unknown token", "unknown-token"],
    ])("returns 401 with %s", async (_, value) => {
      expect((await session(value)).status).toBe(401);
    });

    it("accepts activity just under 10 minutes apart and extends the session", async () => {
      t.clock.advance(10 * minute - 1000);
      expect((await session(token)).status).toBe(200);
      t.clock.advance(10 * minute - 1000);
      expect((await session(token)).status).toBe(200);
    });

    it("returns 401 and clears the cookie after 10 minutes without activity", async () => {
      t.clock.advance(10 * minute);
      const response = await session(token);
      expect(response.status).toBe(401);
      expect(sessionCookieHeader(response)).toMatch(/^cawb_session=;.*Expires=Thu, 01 Jan 1970/);
      expect(await t.prisma.authSession.count()).toBe(0);
    });

    it("returns 401 after 12 hours even with continuous activity", async () => {
      for (let elapsed = 0; elapsed < 12 * 60 * minute - 5 * minute; elapsed += 5 * minute) {
        t.clock.advance(5 * minute);
        expect((await session(token)).status).toBe(200);
      }
      t.clock.advance(5 * minute);
      expect((await session(token)).status).toBe(401);
    });
  });

  describe("POST /api/auth/sign-out (AC-8)", () => {
    it("ends the session, clears the cookie, and returns 204", async () => {
      const token = sessionCookie(
        await signIn({ email: "user@example.test", password: "right-password" }),
      );
      const response = await signOut(token);
      expect(response.status).toBe(204);
      expect(sessionCookieHeader(response)).toMatch(/^cawb_session=;/);
      expect((await session(token)).status).toBe(401);
      expect(await t.prisma.authSession.count()).toBe(0);
    });

    it.each([
      ["no cookie", undefined],
      ["unknown token", "unknown-token"],
    ])("is idempotent with %s", async (_, value) => {
      expect((await signOut(value)).status).toBe(204);
    });

    it("is idempotent for an already-ended session", async () => {
      const token = sessionCookie(
        await signIn({ email: "user@example.test", password: "right-password" }),
      );
      await signOut(token);
      expect((await signOut(token)).status).toBe(204);
    });
  });
});
