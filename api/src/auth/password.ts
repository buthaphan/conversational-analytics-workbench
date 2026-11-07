import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** scrypt cost parameters. Defaults follow the OWASP password storage recommendation (DEC-003). */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;
// Upper bounds for parameters read back from a stored hash, so a bad value cannot exhaust memory or CPU.
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs about 128 * N * r bytes; allow headroom above Node's 32 MiB default.
    const maxmem = 256 * N * r + 1024 * 1024;
    scrypt(password, salt, KEY_BYTES, { N, r, p, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$key` (salt and key base64url). The password itself is never stored. */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function parseHash(hash: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  if (N === undefined || r === undefined || p === undefined) return null;
  const powerOfTwo = Number.isInteger(Math.log2(N));
  if (!powerOfTwo || N < 2 || N > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const key = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length !== SALT_BYTES || key.length !== KEY_BYTES) return null;
  return { params: { N, r, p }, salt, key };
}

/** Constant-time check of a password against a stored hash. Malformed hashes return false. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parsed = parseHash(hash);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed.params);
  return timingSafeEqual(candidate, parsed.key);
}
