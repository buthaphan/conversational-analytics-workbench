import { describe, expect, it } from "vitest";
import { parseTurnDecision } from "../../analysis/decision/turn-decision";
import { DemoLlmClient } from "../../analysis/llm/demo-llm-client";
import { CASES, STATES, TODAY, contextFor, mismatches } from "./cases";

/**
 * Offline check of the evaluation harness (TASK-004 AC-10): the demo model returns the reference
 * decision for each walkthrough sentence, so it must pass every demo case. No API call.
 */
describe("model evaluation cases", () => {
  const demo = new DemoLlmClient();

  it("has unique IDs, a safety subset, and every source", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(CASES.filter((c) => c.safety).length).toBeGreaterThanOrEqual(5);
    expect(new Set(CASES.map((c) => c.source))).toEqual(
      new Set(["demo", "catalogue", "requirements", "added"]),
    );
  });

  it.each(CASES.filter((c) => c.source === "demo"))(
    "the demo model's reference decision passes $id",
    async (c) => {
      const raw = await demo.decide(contextFor(c), c.text);
      const parsed = parseTurnDecision(raw);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const scope = STATES[c.state].activeResult?.scope ?? null;
      const results = c.expect.map((e) =>
        mismatches(parsed.decision as unknown as Record<string, unknown>, e, scope),
      );
      expect(
        results.some((m) => m.length === 0),
        JSON.stringify(results),
      ).toBe(true);
    },
  );

  it("rejects a wrong decision", () => {
    const c = CASES.find((x) => x.id === "demo-04");
    expect(c).toBeDefined();
    const wrong = {
      relevance: "active_result",
      need: "answerable_now",
      action: { type: "refine", refinement: { sort: { field: "total_spend", direction: "desc" } } },
    };
    expect(mismatches(wrong, c!.expect[0]!, null)).not.toEqual([]);
    expect(TODAY).toBe("2026-11-08");
  });
});
