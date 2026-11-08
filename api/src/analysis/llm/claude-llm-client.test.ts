import { describe, expect, it } from "vitest";
import type { ModelContext } from "../context/model-context";
import { TURN_DECISION_JSON_SCHEMA } from "../decision/turn-decision";
import {
  CLAUDE_EFFORT,
  CLAUDE_MAX_RETRIES,
  CLAUDE_MAX_TOKENS,
  CLAUDE_TIMEOUT_MS,
  ClaudeLlmClient,
  ModelOutputError,
  ModelRefusalError,
  ModelTruncatedError,
  SYSTEM_INSTRUCTIONS,
  type CreateMessage,
  structuredOutputSchema,
} from "./claude-llm-client";

const context: ModelContext = {
  today: "2026-11-08",
  catalogue: [
    {
      id: "customer_spending",
      title: "Customer spending",
      description: "Customers by completed spend.",
      whenToUse: "Compare customers by money spent.",
      clarifyWhen: "Ask what 'best' means.",
      scope: "start_date inclusive, end_date exclusive.",
      fields: [{ name: "total_spend", kind: "money", description: "Sum of completed items." }],
      analyses: { summary: ["total_spend"], concentration: ["total_spend"], groupBy: [] },
    },
  ],
  activeResult: {
    capability: "customer_spending",
    scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
    rowCount: 6644,
    fields: ["customer_id", "total_spend"],
    view: {
      filters: [],
      sort: { field: "total_spend", direction: "desc" },
      limit: 10,
      view: "bar",
    },
  },
  allowedValues: {},
  recentTurns: [{ role: "user", text: "Who spent the most?" }],
  pending: null,
};

type Call = { params: Record<string, unknown>; options: Record<string, unknown> | undefined };
const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text: '{"relevance":"unrelated"}' }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
  ...over,
});
function fake(reply: () => Promise<unknown>) {
  const calls: Call[] = [];
  const create: CreateMessage = async (params, options) => {
    calls.push({ params: params as never, options: options as never });
    return (await reply()) as never;
  };
  return { calls, create };
}

describe("Claude LLM client (TASK-004 AC-9)", () => {
  it("sends exactly the fixed instructions, the catalogue, the rest of the context, and the user text", async () => {
    const { calls, create } = fake(async () => message());
    await new ClaudeLlmClient(create, "claude-sonnet-5-5").decide(context, "Who spent the most?");
    const { params } = calls[0] as Call;
    const { catalogue, ...turn } = context;

    expect(Object.keys(params).sort()).toEqual(
      ["betas", "fallbacks", "max_tokens", "messages", "model", "output_config", "system"].sort(),
    );
    expect(params.system).toEqual([
      {
        type: "text",
        text: `${SYSTEM_INSTRUCTIONS}\n\n<catalogue>\n${JSON.stringify(catalogue)}\n</catalogue>`,
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(params.messages).toEqual([
      {
        role: "user",
        content: `<context>\n${JSON.stringify(turn)}\n</context>\n\n<user_message>\nWho spent the most?\n</user_message>`,
      },
    ]);
  });

  it("uses the configured model, structured output, bounded tokens, and server-side fallbacks", async () => {
    const { calls, create } = fake(async () => message());
    await new ClaudeLlmClient(create, "claude-sonnet-5-5").decide(context, "hi");
    const { params, options } = calls[0] as Call;
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.max_tokens).toBe(CLAUDE_MAX_TOKENS);
    expect(CLAUDE_MAX_TOKENS).toBeLessThanOrEqual(16_000);
    expect(params.output_config).toEqual({
      effort: CLAUDE_EFFORT,
      format: { type: "json_schema", schema: structuredOutputSchema(TURN_DECISION_JSON_SCHEMA) },
    });
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(options).toEqual({ timeout: CLAUDE_TIMEOUT_MS, maxRetries: CLAUDE_MAX_RETRIES });
    expect(CLAUDE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(CLAUDE_MAX_RETRIES).toBeLessThanOrEqual(1);
  });

  it("returns the raw text output without validating or repairing it", async () => {
    const { create } = fake(async () =>
      message({ content: [{ type: "text", text: "not json at all" }] }),
    );
    expect(await new ClaudeLlmClient(create, "m").decide(context, "hi")).toBe("not json at all");
  });

  it("ignores thinking blocks and joins the text blocks", async () => {
    const { create } = fake(async () =>
      message({
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "text", text: '{"a":' },
          { type: "text", text: "1}" },
        ],
      }),
    );
    expect(await new ClaudeLlmClient(create, "m").decide(context, "hi")).toBe('{"a":1}');
  });

  it.each([
    ["a refusal", message({ stop_reason: "refusal" }), ModelRefusalError],
    ["a truncated response", message({ stop_reason: "max_tokens" }), ModelTruncatedError],
    ["no text", message({ content: [] }), ModelOutputError],
  ])("throws on %s", async (_case, reply, type) => {
    const { create } = fake(async () => reply);
    await expect(new ClaudeLlmClient(create, "m").decide(context, "hi")).rejects.toBeInstanceOf(
      type,
    );
  });

  it("lets API errors and timeouts propagate (the orchestrator logs the class name only)", async () => {
    class APIConnectionTimeoutError extends Error {
      override name = "APIConnectionTimeoutError";
    }
    const { create } = fake(async () => {
      throw new APIConnectionTimeoutError("Request timed out.");
    });
    await expect(new ClaudeLlmClient(create, "m").decide(context, "hi")).rejects.toBeInstanceOf(
      APIConnectionTimeoutError,
    );
  });

  it("offers no demo examples", () => {
    expect(new ClaudeLlmClient(fake(async () => message()).create, "m").demoExamples).toBeNull();
  });

  describe("structured-output schema", () => {
    const schema = structuredOutputSchema(TURN_DECISION_JSON_SCHEMA);
    const keys = new Set<string>();
    const objects: Record<string, unknown>[] = [];
    JSON.parse(JSON.stringify(schema), (key, value) => {
      keys.add(key);
      if (value && typeof value === "object" && (value as { type?: string }).type === "object")
        objects.push(value);
      return value;
    });

    it("drops keywords structured output does not accept", () => {
      for (const unsupported of [
        "$schema",
        "oneOf",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
        "default",
      ])
        expect(keys.has(unsupported)).toBe(false);
      expect(keys.has("anyOf")).toBe(true);
    });

    it("closes every object", () => {
      expect(objects.length).toBeGreaterThan(5);
      for (const object of objects) expect(object.additionalProperties).toBe(false);
    });

    it("stays within the API's limit of 24 optional parameters (shared definitions count once)", () => {
      // The live evaluation's first run was rejected: "too many optional parameters (26)".
      let optional = 0;
      const visit = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== "object") return;
        const n = node as Record<string, unknown>;
        if (n.type === "object" && n.properties) {
          const required = new Set((n.required as string[] | undefined) ?? []);
          optional += Object.keys(n.properties).filter((k) => !required.has(k)).length;
        }
        Object.values(n).forEach(visit);
      };
      visit(schema);
      expect(optional).toBeLessThanOrEqual(24);
    });

    it("keeps the decision's shape (enums, required fields, action variants)", () => {
      const action = (schema.properties as Record<string, { anyOf: unknown[] }>).action;
      expect(action?.anyOf).toHaveLength(7);
      expect(schema.required).toEqual(["relevance", "need", "action"]);
    });
  });
});
