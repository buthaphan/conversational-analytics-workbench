export type NodeEnv = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnv;
  databaseUrl: string;
  /** The only origin allowed to send POST requests; also the web app's address. */
  appOrigin: string;
  /** Adds `Secure` and the `__Host-` cookie prefix. Required in production. */
  cookieSecure: boolean;
  /** Inactivity timeout. 10 minutes by default; may be shortened for manual testing, never lengthened. */
  idleTimeoutMs: number;
  /** Absolute session lifetime (DEC-007). */
  maxSessionMs: number;
  port: number;
}

export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`APP_ORIGIN must be an origin such as http://localhost:5173 (got "${value}").`);
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error(`APP_ORIGIN must be a bare origin without a path (got "${value}").`);
  }
  return url.origin;
}

function parseBoolean(env: Env, name: string): boolean {
  const value = env[name];
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false" (got "${value}").`);
}

function parseIdleTimeout(env: Env): number {
  const value = env.SESSION_IDLE_TIMEOUT_SECONDS;
  if (value === undefined || value === "") return IDLE_TIMEOUT_MS;
  const seconds = Number(value);
  if (!/^\d+$/.test(value) || seconds < 1 || seconds * 1000 > IDLE_TIMEOUT_MS) {
    throw new Error(
      `SESSION_IDLE_TIMEOUT_SECONDS must be a whole number from 1 to ${IDLE_TIMEOUT_MS / 1000} (got "${value}").`,
    );
  }
  return seconds * 1000;
}

function parseNodeEnv(env: Env): NodeEnv {
  const value = env.NODE_ENV || "development";
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`NODE_ENV must be development, test, or production (got "${value}").`);
}

/** Reads and validates configuration. Throws on anything unsafe, so the API refuses to start. */
export function loadConfig(env: Env): AppConfig {
  const config: AppConfig = {
    nodeEnv: parseNodeEnv(env),
    databaseUrl: required(env, "DATABASE_URL"),
    appOrigin: parseOrigin(required(env, "APP_ORIGIN")),
    cookieSecure: parseBoolean(env, "COOKIE_SECURE"),
    idleTimeoutMs: parseIdleTimeout(env),
    maxSessionMs: MAX_SESSION_MS,
    port: Number(env.API_PORT || 3000),
  };

  if (config.nodeEnv === "production") {
    if (!config.cookieSecure) {
      throw new Error("COOKIE_SECURE must be true in production.");
    }
    if (!config.appOrigin.startsWith("https://")) {
      throw new Error("APP_ORIGIN must use https:// in production.");
    }
  }
  return config;
}
