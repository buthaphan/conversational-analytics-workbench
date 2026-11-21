import { describe, expect, it } from "vitest";
import { validateRequestParameters } from "../../analysis/capabilities/registry";
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

  describe("TASK-005 cases (AC-14)", () => {
    const ids = CASES.map((c) => c.id);

    it("adds about 20 cases for sales over time, grouping, views, and refusals", () => {
      const added = ids.filter((id) => /^(ts|grp)-/.test(id) || /^demo-2[1-4]$/.test(id));
      expect(added.length).toBeGreaterThanOrEqual(20);
      expect(CASES.length).toBeGreaterThanOrEqual(57);
    });

    it("covers each comparison baseline, an unclear baseline, filters, and both refusals", () => {
      const expectations = CASES.flatMap((c) => c.expect.map((e) => ({ c, e })));
      const baselines = new Set(
        expectations.map(({ e }) => (e.parameters?.comparison as { baseline?: string })?.baseline),
      );
      for (const b of ["previous_period", "previous_year", "custom"])
        expect(baselines).toContain(b);
      expect(expectations.some(({ c, e }) => c.state === "series" && e.type === "clarify")).toBe(
        true,
      );
      const filters = expectations.map(
        ({ e }) => (e.parameters?.product_filter as { field?: string })?.field,
      );
      expect(filters).toContain("category");
      expect(filters).toContain("department");
      const seriesSafety = CASES.filter((c) => c.state === "series" && c.safety);
      expect(seriesSafety.map((c) => c.text).join(" ")).toMatch(/forecast/i);
      expect(seriesSafety.map((c) => c.text).join(" ")).toMatch(/why/i);
    });

    it("covers grouping by each dimension and the new views", () => {
      const groupings = CASES.flatMap((c) => c.expect).map((e) => e.refinement?.group_by);
      for (const g of ["category", "department", "brand", "none"]) expect(groupings).toContain(g);
      const views = CASES.flatMap((c) => c.expect.map((e) => `${c.state}:${e.view ?? ""}`));
      for (const v of [
        "series:bar",
        "series:pie",
        "productsGrouped:pie",
        "productsGrouped:horizontal_bar",
      ])
        expect(views).toContain(v);
    });

    it("never expects the removed group analysis", () => {
      for (const c of CASES)
        for (const e of c.expect) expect(e.analysis?.operation, c.id).not.toBe("group");
    });

    it("expects only time-series requests the backend accepts", () => {
      for (const c of CASES)
        for (const e of c.expect) {
          if (e.type !== "request_data" || e.capability !== "sales_time_series") continue;
          const scope =
            e.scope && e.scope !== "inherit"
              ? e.scope
              : (STATES[c.state].activeResult?.scope ?? {
                  start_date: "2025-01-01",
                  end_date: "2026-01-01",
                });
          const checked = validateRequestParameters(
            "sales_time_series",
            scope,
            e.parameters as never,
            e.refinement as never,
          );
          expect(checked.ok, c.id).toBe(true);
        }
    });
  });

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
