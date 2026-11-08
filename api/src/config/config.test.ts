import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_ORIGIN: "http://localhost:5173",
};

describe("loadConfig (AC-6, AC-11)", () => {
  it("uses safe defaults for local development", () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      nodeEnv: "development",
      databaseUrl: base.DATABASE_URL,
      appOrigin: "http://localhost:5173",
      cookieSecure: false,
      idleTimeoutMs: 10 * 60 * 1000,
      maxSessionMs: 12 * 60 * 60 * 1000,
      port: 3000,
    });
  });

  it("listens only on this computer by default; containers set API_HOST=0.0.0.0 (review R4)", () => {
    expect(loadConfig(base).host).toBe("127.0.0.1");
    expect(loadConfig({ ...base, API_HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });

  it("accepts a shorter idle timeout for manual testing", () => {
    expect(loadConfig({ ...base, SESSION_IDLE_TIMEOUT_SECONDS: "120" }).idleTimeoutMs).toBe(
      120_000,
    );
  });

  it.each(["601", "0", "-5", "abc", "1.5"])("rejects an idle timeout of %s seconds", (value) => {
    expect(() => loadConfig({ ...base, SESSION_IDLE_TIMEOUT_SECONDS: value })).toThrow(
      /SESSION_IDLE_TIMEOUT_SECONDS/,
    );
  });

  it.each(["DATABASE_URL", "APP_ORIGIN"])("requires %s", (name) => {
    const env: Record<string, string> = { ...base };
    delete env[name];
    expect(() => loadConfig(env)).toThrow(new RegExp(name));
  });

  it("normalizes APP_ORIGIN to a bare origin and rejects values that are not origins", () => {
    expect(loadConfig({ ...base, APP_ORIGIN: "http://127.0.0.1:8080/" }).appOrigin).toBe(
      "http://127.0.0.1:8080",
    );
    expect(() => loadConfig({ ...base, APP_ORIGIN: "http://x.test/path" })).toThrow(/APP_ORIGIN/);
    expect(() => loadConfig({ ...base, APP_ORIGIN: "not a url" })).toThrow(/APP_ORIGIN/);
  });

  it.each(["yes", "1", "TRUE "])("rejects COOKIE_SECURE=%s (only true or false)", (value) => {
    expect(() => loadConfig({ ...base, COOKIE_SECURE: value })).toThrow(/COOKIE_SECURE/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("uses the demo analysis model by default outside production (TASK-003 AC-15)", () => {
    expect(loadConfig(base).analysisModel).toBe("demo");
    expect(loadConfig({ ...base, NODE_ENV: "test" }).analysisModel).toBe("demo");
    expect(loadConfig({ ...base, ANALYSIS_MODEL: "none" }).analysisModel).toBe("none");
    expect(() => loadConfig({ ...base, ANALYSIS_MODEL: "gpt" })).toThrow(/ANALYSIS_MODEL/);
  });

  describe("real adapters (TASK-004 AC-3)", () => {
    const KEY = "sk-ant-test-NOT-A-REAL-KEY-7d1c";

    it("uses the fixture data source by default outside production", () => {
      expect(loadConfig(base).dataSource).toEqual({ kind: "fixture" });
      expect(loadConfig({ ...base, NODE_ENV: "test" }).dataSource).toEqual({ kind: "fixture" });
    });

    it("selects BigQuery with a project ID", () => {
      expect(
        loadConfig({ ...base, DATA_SOURCE: "bigquery", GOOGLE_CLOUD_PROJECT: "cawb-showcase-1" })
          .dataSource,
      ).toEqual({ kind: "bigquery", projectId: "cawb-showcase-1" });
    });

    it("refuses BigQuery without a valid project ID", () => {
      expect(() => loadConfig({ ...base, DATA_SOURCE: "bigquery" })).toThrow(
        /GOOGLE_CLOUD_PROJECT is required/,
      );
      expect(() =>
        loadConfig({ ...base, DATA_SOURCE: "bigquery", GOOGLE_CLOUD_PROJECT: "Bad Project!" }),
      ).toThrow(/GOOGLE_CLOUD_PROJECT/);
    });

    it("rejects an unknown data source", () => {
      expect(() => loadConfig({ ...base, DATA_SOURCE: "csv" })).toThrow(
        /DATA_SOURCE must be fixture or bigquery/,
      );
    });

    it("selects Claude with an API key, defaulting to Sonnet 5.5", () => {
      const config = loadConfig({ ...base, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: KEY });
      expect(config.analysisModel).toBe("claude");
      expect(config.anthropic).toEqual({ apiKey: KEY, model: "claude-sonnet-5-5" });
    });

    it("lets ANTHROPIC_MODEL override the model ID", () => {
      const config = loadConfig({
        ...base,
        ANALYSIS_MODEL: "claude",
        ANTHROPIC_API_KEY: KEY,
        ANTHROPIC_MODEL: "claude-opus-5-5",
      });
      expect(config.anthropic?.model).toBe("claude-opus-5-5");
      expect(() =>
        loadConfig({
          ...base,
          ANALYSIS_MODEL: "claude",
          ANTHROPIC_API_KEY: KEY,
          ANTHROPIC_MODEL: "a b",
        }),
      ).toThrow(/ANTHROPIC_MODEL/);
    });

    it("refuses Claude without an API key", () => {
      expect(() => loadConfig({ ...base, ANALYSIS_MODEL: "claude" })).toThrow(
        /ANTHROPIC_API_KEY is required/,
      );
      expect(() =>
        loadConfig({ ...base, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: "   " }),
      ).toThrow(/ANTHROPIC_API_KEY is required/);
    });

    it("keeps no key when the model is not Claude", () => {
      expect(loadConfig({ ...base, ANTHROPIC_API_KEY: KEY }).anthropic).toBeNull();
    });

    it("never puts a secret value in an error message", () => {
      const bad: Record<string, string>[] = [
        { ...base, ANALYSIS_MODEL: "gpt", ANTHROPIC_API_KEY: KEY },
        { ...base, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "a b" },
        { ...base, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: KEY, DATA_SOURCE: "csv" },
        { ...base, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: KEY, DATA_SOURCE: "bigquery" },
        {
          ...base,
          NODE_ENV: "production",
          ANALYSIS_MODEL: "claude",
          ANTHROPIC_API_KEY: KEY,
          COOKIE_SECURE: "true",
          APP_ORIGIN: "https://showcase.example.test",
          DATA_SOURCE: "fixture",
        },
      ];
      for (const env of bad) {
        let message = "";
        try {
          loadConfig(env);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).not.toBe("");
        expect(message).not.toContain(KEY);
      }
    });
  });

  describe("production", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      APP_ORIGIN: "https://showcase.example.test",
      COOKIE_SECURE: "true",
      GOOGLE_CLOUD_PROJECT: "cawb-showcase-1",
    };

    it("uses BigQuery by default and refuses the fixture (TASK-004 AC-3)", () => {
      expect(loadConfig(production).dataSource).toEqual({
        kind: "bigquery",
        projectId: "cawb-showcase-1",
      });
      expect(() => loadConfig({ ...production, DATA_SOURCE: "fixture" })).toThrow(
        /DATA_SOURCE=fixture/,
      );
    });

    it("accepts the Claude model (TASK-004 AC-3)", () => {
      expect(
        loadConfig({ ...production, ANALYSIS_MODEL: "claude", ANTHROPIC_API_KEY: "sk-x" })
          .analysisModel,
      ).toBe("claude");
    });

    it("starts with Secure cookies and an HTTPS origin", () => {
      expect(loadConfig(production)).toMatchObject({ nodeEnv: "production", cookieSecure: true });
    });

    it("refuses to start without Secure cookies", () => {
      expect(() => loadConfig({ ...production, COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
      const env: Record<string, string> = { ...production };
      delete env.COOKIE_SECURE;
      expect(() => loadConfig(env)).toThrow(/COOKIE_SECURE/);
    });

    it("refuses to start with a non-HTTPS origin", () => {
      expect(() =>
        loadConfig({ ...production, APP_ORIGIN: "http://showcase.example.test" }),
      ).toThrow(/APP_ORIGIN/);
    });

    it("has no analysis model by default and refuses to start with the demo model (TASK-003 AC-15)", () => {
      expect(loadConfig(production).analysisModel).toBe("none");
      expect(() => loadConfig({ ...production, ANALYSIS_MODEL: "demo" })).toThrow(
        /ANALYSIS_MODEL=demo/,
      );
    });
  });
});
