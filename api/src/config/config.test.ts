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

  describe("production", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      APP_ORIGIN: "https://showcase.example.test",
      COOKIE_SECURE: "true",
    };

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
