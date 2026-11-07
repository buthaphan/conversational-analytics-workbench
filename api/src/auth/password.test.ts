import { describe, expect, it } from "vitest";
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from "./password";

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

  it.each([
    ["empty", ""],
    ["wrong scheme", "bcrypt$16384$8$1$AAAA$BBBB"],
    ["missing parts", "scrypt$16384$8$1"],
    ["non-numeric cost", "scrypt$abc$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA"],
    ["cost not a power of two", "scrypt$1000$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA"],
    ["oversized cost", `scrypt$${2 ** 24}$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA`],
  ])("returns false for a malformed hash (%s) instead of throwing", async (_, hash) => {
    expect(await verifyPassword("anything", hash)).toBe(false);
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
