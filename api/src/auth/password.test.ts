import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRYPT_PARAMS,
  hashPassword,
  isSafeScryptParams,
  verifyPassword,
} from "./password";

// Lower cost keeps the suite fast; parameters are stored in each hash, so verification still works.
const fast = { N: 2 ** 14, r: 8, p: 1 };

describe("password hashing (AC-3)", () => {
  it("uses the OWASP scrypt parameters by default", () => {
    expect(DEFAULT_SCRYPT_PARAMS).toEqual({ N: 2 ** 17, r: 8, p: 1 });
  });

  it("hashes with the defaults and stores the parameters, salt, and key in the hash", async () => {
    const hash = await hashPassword("correct horse");
    const [scheme, n, r, p, salt, key] = hash.split("$");
    expect([scheme, n, r, p]).toEqual(["scrypt", "131072", "8", "1"]);
    expect(Buffer.from(salt ?? "", "base64url")).toHaveLength(16);
    expect(Buffer.from(key ?? "", "base64url")).toHaveLength(64);
    expect(hash).not.toContain("correct horse");
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse", fast);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct horsE", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("uses a new random salt every time", async () => {
    const a = await hashPassword("same", fast);
    const b = await hashPassword("same", fast);
    expect(a).not.toBe(b);
  });

  // A well-formed 16-byte salt and 64-byte key, so only the parameters under test can make a case fail.
  const salt = Buffer.alloc(16, 1).toString("base64url");
  const key = Buffer.alloc(64, 2).toString("base64url");
  const withParams = (n: string, r: string, p: string) => ["scrypt", n, r, p, salt, key].join("$");

  it.each([
    ["empty", ""],
    ["wrong scheme", `bcrypt$16384$8$1$${salt}$${key}`],
    ["missing parts", "scrypt$16384$8$1"],
    ["short salt", `scrypt$16384$8$1$AAAA$${key}`],
    ["short key", `scrypt$16384$8$1$${salt}$AAAA`],
    ["non-numeric cost N", withParams("abc", "8", "1")],
    ["non-numeric block size r", withParams("16384", "x", "1")],
    ["non-numeric parallelism p", withParams("16384", "8", "y")],
    ["empty r", withParams("16384", "", "1")],
    ["cost not a power of two", withParams("1000", "8", "1")],
    ["cost of 1", withParams("1", "8", "1")],
    ["zero r", withParams("16384", "0", "1")],
    ["zero p", withParams("16384", "8", "0")],
    ["oversized cost", withParams(String(2 ** 24), "8", "1")],
  ])("returns false for a malformed hash (%s) instead of throwing", async (_, hash) => {
    expect(await verifyPassword("anything", hash)).toBe(false);
  });

  describe("parameter limits (review R3)", () => {
    it("accepts the defaults and the fast test parameters", () => {
      expect(isSafeScryptParams(DEFAULT_SCRYPT_PARAMS)).toBe(true);
      expect(isSafeScryptParams(fast)).toBe(true);
    });

    it("rejects parameters that would need more than 256 MiB", () => {
      // 128 * N * r bytes: 2^20 * 32 needs 4 GiB; 2^18 * 8 needs exactly 256 MiB (allowed).
      expect(isSafeScryptParams({ N: 2 ** 20, r: 32, p: 1 })).toBe(false);
      expect(isSafeScryptParams({ N: 2 ** 19, r: 8, p: 1 })).toBe(false);
      expect(isSafeScryptParams({ N: 2 ** 18, r: 8, p: 1 })).toBe(true);
    });

    it.each([NaN, Infinity, 1.5, -2])("rejects a non-integer or negative value (%s)", (value) => {
      expect(isSafeScryptParams({ N: 2 ** 14, r: value, p: 1 })).toBe(false);
      expect(isSafeScryptParams({ N: 2 ** 14, r: 8, p: value })).toBe(false);
      expect(isSafeScryptParams({ N: value, r: 8, p: 1 })).toBe(false);
    });
  });

  it("returns false when the stored key has been tampered with", async () => {
    const hash = await hashPassword("secret", fast);
    const parts = hash.split("$");
    const key = Buffer.from(parts[5] ?? "", "base64url");
    key[0] = (key[0] ?? 0) ^ 0xff;
    parts[5] = key.toString("base64url");
    expect(await verifyPassword("secret", parts.join("$"))).toBe(false);
  });
});
