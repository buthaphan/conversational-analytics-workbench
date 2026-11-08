export type NodeEnv = "development" | "test" | "production";
/**
 * `demo`: the development demo model (TASK-003 DEC-001). `none`: no model; every question gets the
 * generic error. `claude`: the Anthropic API (TASK-004 AC-3).
 */
export type AnalysisModel = "demo" | "none" | "claude";
/** `fixture`: the deterministic TASK-003 fixture. `bigquery`: TheLook in BigQuery (TASK-004). */
export type DataSourceConfig = { kind: "fixture" } | { kind: "bigquery"; projectId: string };

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

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
  /** Network interface to listen on. 127.0.0.1 outside containers; the API image sets 0.0.0.0. */
  host: string;
  /** Which model decides each analysis turn (TASK-003 AC-15). */
  analysisModel: AnalysisModel;
  /** Set only when `analysisModel` is `claude`. The key comes from the environment only. */
  anthropic: { apiKey: string; model: string } | null;
  /** Where results are retrieved from (TASK-004 AC-3). */
  dataSource: DataSourceConfig;
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

function parseAnalysisModel(env: Env, nodeEnv: NodeEnv): AnalysisModel {
  const value = env.ANALYSIS_MODEL?.trim() || (nodeEnv === "production" ? "none" : "demo");
  if (value !== "demo" && value !== "none" && value !== "claude") {
    throw new Error(`ANALYSIS_MODEL must be demo, none, or claude (got "${value}").`);
  }
  return value;
}

/** Error messages name the variable and never echo the key. */
function parseAnthropic(env: Env, model: AnalysisModel): AppConfig["anthropic"] {
  if (model !== "claude") return null;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when ANALYSIS_MODEL=claude.");
  const modelId = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(modelId)) {
    throw new Error(`ANTHROPIC_MODEL must be a model ID such as ${DEFAULT_ANTHROPIC_MODEL}.`);
  }
  return { apiKey, model: modelId };
}

function parseDataSource(env: Env, nodeEnv: NodeEnv): DataSourceConfig {
  const kind = env.DATA_SOURCE?.trim() || (nodeEnv === "production" ? "bigquery" : "fixture");
  if (kind === "fixture") return { kind };
  if (kind !== "bigquery")
    throw new Error(`DATA_SOURCE must be fixture or bigquery (got "${kind}").`);
  const projectId = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT is required when DATA_SOURCE=bigquery.");
  // Google Cloud project IDs: 6–30 characters, lower-case letters, digits, and hyphens.
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT must be a Google Cloud project ID such as my-project-123.",
    );
  }
  return { kind, projectId };
}

/** Reads and validates configuration. Throws on anything unsafe, so the API refuses to start. */
export function loadConfig(env: Env): AppConfig {
  const nodeEnv = parseNodeEnv(env);
  const analysisModel = parseAnalysisModel(env, nodeEnv);
  const config: AppConfig = {
    nodeEnv,
    databaseUrl: required(env, "DATABASE_URL"),
    appOrigin: parseOrigin(required(env, "APP_ORIGIN")),
    cookieSecure: parseBoolean(env, "COOKIE_SECURE"),
    idleTimeoutMs: parseIdleTimeout(env),
    maxSessionMs: MAX_SESSION_MS,
    port: Number(env.API_PORT || 3000),
    host: env.API_HOST?.trim() || "127.0.0.1",
    analysisModel,
    anthropic: parseAnthropic(env, analysisModel),
    dataSource: parseDataSource(env, nodeEnv),
  };

  if (config.nodeEnv === "production") {
    if (!config.cookieSecure) {
      throw new Error("COOKIE_SECURE must be true in production.");
    }
    if (!config.appOrigin.startsWith("https://")) {
      throw new Error("APP_ORIGIN must use https:// in production.");
    }
    if (config.analysisModel === "demo") {
      throw new Error("ANALYSIS_MODEL=demo is for development only and is refused in production.");
    }
    if (config.dataSource.kind === "fixture") {
      throw new Error("DATA_SOURCE=fixture is for development only and is refused in production.");
    }
  }
  return config;
}
