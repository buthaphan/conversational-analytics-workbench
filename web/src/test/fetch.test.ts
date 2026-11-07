import { afterEach, describe, expect, it, vi } from "vitest";
import { getSession } from "../auth/api";
import { mockFetch } from "./fetch";

describe("mockFetch (review R2d)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // `fails` inverts the result: this test passes only if an unexpected request makes it fail.
  it.fails(
    "fails a test that makes an unlisted request, even though the client swallows it",
    async () => {
      mockFetch({});
      expect(await getSession()).toEqual({ status: "error", error: "network" });
    },
  );

  it("does not fail a test whose requests are all listed", async () => {
    mockFetch({ "GET /api/auth/session": { status: 401, body: {} } });
    expect(await getSession()).toEqual({ status: "signed-out" });
  });
});
