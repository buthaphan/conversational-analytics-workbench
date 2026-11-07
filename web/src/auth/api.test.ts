import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "../test/fetch";
import { getSession, signIn, signOut } from "./api";

const user = { email: "user@example.test" };

describe("auth API client (AC-13, AC-14)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getSession", () => {
    it("returns the user for a valid session, sending the cookie on the same origin", async () => {
      const fetchMock = mockFetch({ "GET /api/auth/session": { status: 200, body: { user } } });
      expect(await getSession()).toEqual({ status: "signed-in", user });
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin" });
    });

    it("reports a signed-out user on 401", async () => {
      mockFetch({ "GET /api/auth/session": { status: 401, body: { message: "x" } } });
      expect(await getSession()).toEqual({ status: "signed-out" });
    });

    it("reports a network failure", async () => {
      mockFetch({ "GET /api/auth/session": "network-error" });
      expect(await getSession()).toEqual({ status: "error", error: "network" });
    });

    it("reports an unexpected server response", async () => {
      mockFetch({ "GET /api/auth/session": { status: 500, body: {} } });
      expect(await getSession()).toEqual({ status: "error", error: "unexpected" });
    });
  });

  describe("signIn", () => {
    it("posts JSON credentials and returns the user", async () => {
      const fetchMock = mockFetch({ "POST /api/auth/sign-in": { status: 200, body: { user } } });
      expect(await signIn("user@example.test", "pw")).toEqual({ ok: true, user });
      const init = fetchMock.mock.calls[0]?.[1];
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        email: "user@example.test",
        password: "pw",
      });
    });

    it.each([
      [401, "invalid"],
      [429, "rate-limited"],
      [400, "invalid"],
      [500, "unexpected"],
      [403, "unexpected"],
    ] as const)("maps %i to %s", async (status, error) => {
      mockFetch({ "POST /api/auth/sign-in": { status, body: { message: "x" } } });
      expect(await signIn("a@b.test", "pw")).toEqual({ ok: false, error });
    });

    it("maps a network failure", async () => {
      mockFetch({ "POST /api/auth/sign-in": "network-error" });
      expect(await signIn("a@b.test", "pw")).toEqual({ ok: false, error: "network" });
    });
  });

  describe("signOut", () => {
    it("posts to sign-out and reports success on 204", async () => {
      const fetchMock = mockFetch({ "POST /api/auth/sign-out": { status: 204 } });
      expect(await signOut()).toBe(true);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
      });
    });

    it("reports failure on a network error", async () => {
      mockFetch({ "POST /api/auth/sign-out": "network-error" });
      expect(await signOut()).toBe(false);
    });
  });
});
