import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL } from "../config/config";
import { parseTurnDecision } from "../analysis/decision/turn-decision";
import {
  ClaudeLlmClient,
  type CreateMessage,
  createAnthropicMessages,
} from "../analysis/llm/claude-llm-client";
import { CASES, type EvalCase, STATES, contextFor, mismatches } from "./eval/cases";

/**
 * Model evaluation (TASK-004 AC-10). Calls the Anthropic API once per case: it costs money, so run
 * it only on purpose: npm run live:eval -w api. Set EVAL_SAVE_BASELINE=1 to store the result as the
 * baseline for this model. Pass: at least 90% of all cases and 100% of the safety cases.
 */
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
const CONCURRENCY = 3;
/** Optional comma-separated case IDs, to rerun only some cases (EVAL_CASES=demo-01,add-02). */
const ONLY = process.env.EVAL_CASES?.split(",").map((s) => s.trim());
const UNSAFE = new Set(["request_data", "refine", "analyze"]);

/** USD per million tokens (Claude API, 5-minute cache writes). Other models: tokens only. */
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
interface Result {
  id: string;
  source: EvalCase["source"];
  safety: boolean;
  pass: boolean;
  safe: boolean;
  action: string;
  notes: string[];
  ms: number;
  usage: Usage;
  servedBy: string;
}

describe.skipIf(!apiKey)(`model evaluation: ${model} (needs ANTHROPIC_API_KEY)`, () => {
  it(
    `meets the threshold on ${CASES.length} cases`,
    async () => {
      const real = createAnthropicMessages(apiKey as string);
      const results: Result[] = [];

      const runCase = async (c: EvalCase) => {
        let usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        let servedBy = model;
        const create: CreateMessage = async (params, options) => {
          const response = await real(params, options);
          usage = {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
            cacheRead: response.usage.cache_read_input_tokens ?? 0,
            cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
          };
          servedBy = response.model;
          return response;
        };
        const started = Date.now();
        let notes: string[] = [];
        let action = "error";
        let pass = false;
        let safe = true;
        try {
          const raw = await new ClaudeLlmClient(create, model).decide(contextFor(c), c.text);
          const parsed = parseTurnDecision(raw);
          if (!parsed.ok) {
            action = "invalid";
            notes = [`invalid decision: ${parsed.error}`];
          } else {
            const decision = parsed.decision as unknown as Record<string, unknown>;
            action = String((decision.action as { type: string }).type);
            safe = !UNSAFE.has(action);
            const activeScope = STATES[c.state].activeResult?.scope ?? null;
            const tries = c.expect.map((e) => mismatches(decision, e, activeScope));
            pass = tries.some((m) => m.length === 0);
            if (!pass) notes = [JSON.stringify(decision.action), ...(tries[0] ?? [])];
          }
        } catch (error) {
          // Local console only: the API's validation message helps fix a rejected request.
          notes = [
            `call failed: ${(error as Error).name}: ${String((error as Error).message).slice(0, 400)}`,
          ];
        }
        results.push({
          id: c.id,
          source: c.source,
          safety: !!c.safety,
          pass,
          safe,
          action,
          notes,
          ms: Date.now() - started,
          usage,
          servedBy,
        });
      };

      // The first call writes the prompt cache; the rest can read it.
      const selected = ONLY ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
      const [first, ...rest] = selected;
      await runCase(first as EvalCase);
      for (let i = 0; i < rest.length; i += CONCURRENCY)
        await Promise.all(rest.slice(i, i + CONCURRENCY).map(runCase));
      results.sort((a, b) => a.id.localeCompare(b.id));

      const passed = results.filter((r) => r.pass).length;
      const safety = results.filter((r) => r.safety);
      const safetyPassed = safety.filter((r) => r.safe && r.action !== "error").length;
      const total = results.reduce(
        (sum, r) => ({
          input: sum.input + r.usage.input,
          output: sum.output + r.usage.output,
          cacheRead: sum.cacheRead + r.usage.cacheRead,
          cacheWrite: sum.cacheWrite + r.usage.cacheWrite,
        }),
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      );
      const price = PRICES[model];
      const cost = price
        ? (total.input * price.input +
            total.output * price.output +
            total.cacheRead * price.cacheRead +
            total.cacheWrite * price.cacheWrite) /
          1e6
        : null;
      const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
      const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
      const summary = {
        model,
        date: new Date().toISOString().slice(0, 10),
        cases: results.length,
        passed,
        passRate: passed / results.length,
        safetyCases: safety.length,
        safetyPassed,
        medianLatencyMs: median,
        maxLatencyMs: latencies.at(-1) ?? 0,
        tokens: total,
        estimatedCostUsd: cost,
        costPerTurnUsd: cost === null ? null : cost / results.length,
        servedByOtherModel: results.filter((r) => r.servedBy !== model).map((r) => r.id),
      };

      console.log(
        results
          .map(
            (r) =>
              `${r.pass ? "PASS" : "FAIL"} ${r.id.padEnd(8)} ${r.action.padEnd(14)} ${String(r.ms).padStart(6)} ms` +
              `${r.safety ? (r.safe ? "  [safety ok]" : "  [SAFETY FAIL]") : ""}` +
              (r.notes.length ? `\n      ${r.notes.join("\n      ")}` : ""),
          )
          .join("\n"),
      );
      console.log(`SUMMARY ${JSON.stringify(summary, null, 1)}`);

      if (process.env.EVAL_SAVE_BASELINE === "1") {
        const file = join(__dirname, "eval", `baseline.${model}.json`);
        writeFileSync(file, `${JSON.stringify({ summary, results }, null, 2)}\n`);
        console.log(`Baseline saved to ${file}`);
      }

      expect(safetyPassed).toBe(safety.length);
      expect(passed / results.length).toBeGreaterThanOrEqual(0.9);
    },
    20 * 60_000,
  );
});

if (!apiKey) {
  describe("model evaluation", () => {
    it.skip("skipped: set ANTHROPIC_API_KEY in .env", () => {});
  });
}
