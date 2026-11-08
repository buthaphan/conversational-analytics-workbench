import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANSWERS, switchQuestion } from "../answers/answers";
import type { CapabilityId, Scope } from "../capabilities/registry";
import { ModelContextBuilder } from "../context/model-context";
import { DataSource, type ResultRowData } from "../data/data-source";
import { ResultEngine } from "../engine/result-engine";
import { createTestPrisma, resetDatabase } from "../../test/database";
import { FakeClock } from "../../test/fake-clock";
import { ScriptedLlmClient } from "../../test/scripted-llm-client";
import { AnalysisOrchestrator } from "./orchestrator";

const prisma = createTestPrisma();
const hour = 60 * 60 * 1000;
const y2025: Scope = { start_date: "2025-01-01", end_date: "2026-01-01" };
const y2023: Scope = { start_date: "2023-01-01", end_date: "2024-01-01" };

const customerRows: ResultRowData[] = Array.from({ length: 10 }, (_, i) => ({
  customer_id: `c${String(i + 1).padStart(2, "0")}`,
  customer_name: `Customer ${i + 1}`,
  total_spend: (i + 1) * 10,
  order_count: i + 1,
  avg_order_value: 10,
}));
const productRows: ResultRowData[] = [
  { product_id: "p1", product_name: "Slim Jeans", category: "Jeans", revenue: 100, item_count: 4 },
  {
    product_id: "p2",
    product_name: "Wool Sweater",
    category: "Sweaters",
    revenue: 200,
    item_count: 5,
  },
];

/** Counts retrievals and can be told to fail. */
class CountingDataSource extends DataSource {
  calls: { capability: CapabilityId; scope: Scope }[] = [];
  fail = false;
  async fetch(capability: CapabilityId, scope: Scope): Promise<ResultRowData[]> {
    this.calls.push({ capability, scope });
    if (this.fail) throw new Error("source unavailable");
    return capability === "customer_spending" ? customerRows : productRows;
  }
}

const base = { relevance: "active_result", need: "answerable_now" } as const;
const load = (capability: CapabilityId, scope?: Partial<Scope>, refinement?: object) => ({
  relevance: "other_capability",
  need: "new_data",
  action: {
    type: "request_data",
    capability,
    ...(scope ? { scope } : {}),
    ...(refinement ? { refinement } : {}),
  },
});
const refine = (refinement: object) => ({ ...base, action: { type: "refine", refinement } });

describe("analysis orchestrator (AC-3, AC-4, AC-6, AC-7, AC-11)", () => {
  let llm: ScriptedLlmClient;
  let data: CountingDataSource;
  let orchestrator: AnalysisOrchestrator;
  let authSessionId: string;
  let userId: string;

  const say = async (text: string, ...decisions: unknown[]) => {
    llm.push(...decisions);
    return orchestrator.handleMessage(authSessionId, userId, text);
  };

  beforeEach(async () => {
    await resetDatabase(prisma);
    const user = await prisma.user.create({ data: { email: "u@example.test", passwordHash: "x" } });
    const now = new Date();
    const auth = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: "h",
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + 12 * hour),
      },
    });
    authSessionId = auth.id;
    userId = user.id;
    llm = new ScriptedLlmClient();
    data = new CountingDataSource();
    const engine = new ResultEngine(prisma);
    orchestrator = new AnalysisOrchestrator(
      prisma,
      engine,
      new ModelContextBuilder(prisma, engine),
      llm,
      data,
      new FakeClock(),
      {},
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("retrieves on the first request without asking, applying the requested refinements (AC-4)", async () => {
    const { reply, state } = await say(
      "Who spent the most in 2025?",
      load("customer_spending", y2025, { limit: 3 }),
    );
    expect(data.calls).toHaveLength(1);
    expect(reply.text).toBe(
      "Showing 3 of 10 customers, 1 Jan 2025 – 31 Dec 2025, by total spend (highest first).",
    );
    expect(state.activeResult).toMatchObject({
      capability: "customer_spending",
      rowCount: 10,
      filteredCount: 10,
      rowNoun: ["customer", "customers"],
    });
    expect(state.activeResult?.rows.map((r) => r.customer_id)).toEqual(["c10", "c09", "c08"]);
    expect(state.pending).toBeNull();
  });

  describe("on the active result (AC-6 a)", () => {
    beforeEach(async () => {
      await say("Who spent the most in 2025?", load("customer_spending", y2025, { limit: 3 }));
    });

    it("refines the stored rows without retrieval, keeping earlier settings", async () => {
      await say(
        "Over $50 only",
        refine({ filters: [{ field: "total_spend", op: "gt", value: 50 }] }),
      );
      const { state } = await say(
        "Lowest first",
        refine({ sort: { field: "total_spend", direction: "asc" } }),
      );
      expect(data.calls).toHaveLength(1);
      expect(state.activeResult?.filteredCount).toBe(5);
      expect(state.activeResult?.rows.map((r) => r.customer_id)).toEqual(["c06", "c07", "c08"]);
    });

    it("replaces a filter on the same field and clears all filters on request", async () => {
      await say("Over $50", refine({ filters: [{ field: "total_spend", op: "gt", value: 50 }] }));
      let { state } = await say(
        "Over $80 instead",
        refine({ filters: [{ field: "total_spend", op: "gt", value: 80 }] }),
      );
      expect(state.activeResult?.filteredCount).toBe(2);
      ({ state } = await say("Remove the filters", refine({ clear_filters: true })));
      expect(state.activeResult?.filteredCount).toBe(10);
    });

    it("analyses the complete set while only the top 3 are displayed, without changing the view", async () => {
      const { reply, state } = await say("Top 10% share?", {
        ...base,
        need: "analysis_on_current",
        action: {
          type: "analyze",
          analysis: { operation: "concentration", measure: "total_spend", top_percent: 10 },
        },
      });
      expect(data.calls).toHaveLength(1);
      expect(reply.card).toMatchObject({
        operation: "concentration",
        target: "complete",
        baseCount: 10,
        topRows: 1,
        topTotal: 100,
        total: 550,
      });
      expect(reply.text).toContain("Based on all 10 customers");
      expect(reply.card?.rowNoun).toEqual(["customer", "customers"]);
      expect(reply.card?.fields.find((f) => f.name === "total_spend")).toEqual({
        name: "total_spend",
        label: "Total spend",
        kind: "money",
      });
      expect(state.activeResult?.rows).toHaveLength(3);
    });

    it("changes the view to a table, and refuses unsupported chart types without changing it", async () => {
      let { state } = await say("As a table", {
        ...base,
        action: { type: "change_view", view: "table" },
      });
      expect(state.activeResult?.view.view).toBe("table");
      const result = await say("As a pie chart", {
        ...base,
        action: { type: "change_view", view: "pie" },
      });
      expect(result.reply.text).toBe(ANSWERS.viewUnsupported("pie"));
      state = result.state;
      expect(state.activeResult?.view.view).toBe("table");
      expect(data.calls).toHaveLength(1);
    });

    it("treats a request for the same capability and scope as a refinement, not a retrieval", async () => {
      const { state } = await say(
        "Same again, lowest first",
        load("customer_spending", y2025, { sort: { field: "total_spend", direction: "asc" } }),
      );
      expect(data.calls).toHaveLength(1);
      expect(state.pending).toBeNull();
      expect(state.activeResult?.rows[0]?.customer_id).toBe("c01");
    });
  });

  describe("clarification (AC-6 b, d)", () => {
    it("asks when a field does not exist, leaving the state unchanged", async () => {
      await say("Load", load("customer_spending", y2025));
      const { reply, state } = await say(
        "By region",
        refine({ filters: [{ field: "region", op: "gt", value: 1 }] }),
      );
      expect(reply.text).toContain('This result has no field "region".');
      expect(state.activeResult?.filteredCount).toBe(10);
      expect(data.calls).toHaveLength(1);
    });

    it("lists the valid options when a category value is not allowed", async () => {
      await say("Load products", load("product_sales_performance", y2025));
      const { reply } = await say(
        "Denim only",
        refine({ filters: [{ field: "category", op: "in", values: ["Denim"] }] }),
      );
      expect(reply.text).toContain("Jeans, Sweaters");
    });

    it("asks for the period when a request has no scope and none can be carried over", async () => {
      const { reply, state } = await say("Top customers", load("customer_spending"));
      expect(reply.text).toBe("Which period should I use? Please give a start and end date.");
      expect(data.calls).toHaveLength(0);
      expect(state.activeResult).toBeNull();
    });

    it("stores the model's clarification question as the pending action, cleared by the next message", async () => {
      await say("Load", load("customer_spending", y2025));
      const asked = await say("Best customers", {
        ...base,
        need: "unclear",
        action: { type: "clarify", question: "Highest spend or most orders?" },
      });
      expect(asked.reply.text).toBe("Highest spend or most orders?");
      expect(asked.state.pending).toEqual({
        type: "clarification",
        question: "Highest spend or most orders?",
      });
      const { state } = await say(
        "Highest spend",
        refine({ sort: { field: "total_spend", direction: "desc" } }),
      );
      expect(state.pending).toBeNull();
    });
  });

  describe("switching (AC-6 c, AC-7)", () => {
    beforeEach(async () => {
      await say("Load", load("customer_spending", y2025, { limit: 3 }));
    });

    it("proposes a switch for a different capability without retrieving", async () => {
      const { reply, state } = await say(
        "Show product sales instead",
        load("product_sales_performance", y2025),
      );
      expect(data.calls).toHaveLength(1);
      expect(reply.text).toBe(
        switchQuestion(
          { capability: "customer_spending", scope: y2025 },
          { capability: "product_sales_performance", scope: y2025 },
        ),
      );
      expect(state.pending).toMatchObject({
        type: "switch",
        capability: "product_sales_performance",
        scope: y2025,
      });
      expect(state.activeResult?.capability).toBe("customer_spending");
    });

    it("proposes a switch for the same capability with a different scope", async () => {
      const { state } = await say("Who spent the most in 2023?", load("customer_spending", y2023));
      expect(data.calls).toHaveLength(1);
      expect(state.pending).toMatchObject({
        type: "switch",
        capability: "customer_spending",
        scope: y2023,
      });
    });

    it("carries the current scope over when a switch request omits it", async () => {
      const { state } = await say("Product sales", load("product_sales_performance"));
      expect(state.pending).toMatchObject({
        type: "switch",
        capability: "product_sales_performance",
        scope: y2025,
      });
    });

    it("switches on the Switch button: retrieves, replaces the old result, applies the refinements", async () => {
      await say(
        "Top products by units",
        load("product_sales_performance", y2025, {
          sort: { field: "item_count", direction: "desc" },
        }),
      );
      const { reply, state } = await orchestrator.handleSwitch(authSessionId, userId, "switch");
      expect(data.calls).toHaveLength(2);
      expect(state.activeResult).toMatchObject({
        capability: "product_sales_performance",
        rowCount: 2,
      });
      expect(state.activeResult?.rows[0]?.product_id).toBe("p2");
      expect(state.pending).toBeNull();
      expect(reply.text).toContain("Showing 2 of 2 products");
      expect(await prisma.resultSet.count()).toBe(1);
    });

    it("switches when the reply is classified as a confirmation", async () => {
      await say("Product sales", load("product_sales_performance", y2025));
      const { state } = await say("Yes, switch", {
        ...base,
        action: { type: "confirm_switch", accept: true },
      });
      expect(state.activeResult?.capability).toBe("product_sales_performance");
    });

    it.each([
      [
        "the Keep current button",
        async (o: AnalysisOrchestrator, a: string, u: string) => o.handleSwitch(a, u, "keep"),
      ],
    ])("keeps the current result on %s", async (_, keep) => {
      await say("Product sales", load("product_sales_performance", y2025));
      const { reply, state } = await keep(orchestrator, authSessionId, userId);
      expect(reply.text).toBe(ANSWERS.keepCurrent);
      expect(state.pending).toBeNull();
      expect(state.activeResult?.capability).toBe("customer_spending");
      expect(data.calls).toHaveLength(1);
    });

    it("keeps the current result when the reply declines", async () => {
      await say("Product sales", load("product_sales_performance", y2025));
      const { state } = await say("No, stay", {
        ...base,
        action: { type: "confirm_switch", accept: false },
      });
      expect(state.pending).toBeNull();
      expect(state.activeResult?.capability).toBe("customer_spending");
    });

    it("clears a pending switch when any other message arrives", async () => {
      await say("Product sales", load("product_sales_performance", y2025));
      const { state } = await say(
        "Actually, lowest spenders",
        refine({ sort: { field: "total_spend", direction: "asc" } }),
      );
      expect(state.pending).toBeNull();
      expect(state.activeResult?.capability).toBe("customer_spending");
    });

    it("answers clearly when there is nothing to confirm", async () => {
      const { reply } = await orchestrator.handleSwitch(authSessionId, userId, "switch");
      expect(reply.text).toBe(ANSWERS.noPendingSwitch);
      expect(data.calls).toHaveLength(1);
    });

    it("keeps the old result and the pending switch when retrieval fails", async () => {
      await say("Product sales", load("product_sales_performance", y2025));
      data.fail = true;
      const { reply, state } = await orchestrator.handleSwitch(authSessionId, userId, "switch");
      expect(reply.text).toBe(ANSWERS.retrievalFailed);
      expect(state.activeResult?.capability).toBe("customer_spending");
      expect(state.pending).toMatchObject({
        type: "switch",
        capability: "product_sales_performance",
      });
    });
  });

  describe("replies and failures (AC-3, AC-6 e)", () => {
    it("answers unrelated questions with the model's text, without data access or state change", async () => {
      await say("Load", load("customer_spending", y2025));
      const { reply, state } = await say("What's the weather today?", {
        relevance: "unrelated",
        need: "unsupported",
        action: {
          type: "reply",
          message: "I can only help with questions about the sales data.",
          reason: "unrelated",
        },
      });
      expect(reply.text).toBe("I can only help with questions about the sales data.");
      expect(data.calls).toHaveLength(1);
      expect(state.activeResult?.filteredCount).toBe(10);
    });

    it.each([
      ["invalid model output", () => "not json"],
      [
        "a schema violation",
        () => ({ ...base, action: { type: "run_sql", sql: "DROP TABLE users" } }),
      ],
    ])(
      "fails safely on %s: generic reply, no data access, pending action kept",
      async (_, output) => {
        await say("Load", load("customer_spending", y2025));
        await say("Product sales", load("product_sales_performance", y2025));
        const { reply, state } = await say("???", output());
        expect(reply.text).toBe(ANSWERS.invalidDecision);
        expect(state.pending).toMatchObject({ type: "switch" });
        expect(data.calls).toHaveLength(1);
      },
    );

    it("fails safely when the model call throws", async () => {
      llm.failNext();
      const { reply } = await orchestrator.handleMessage(authSessionId, userId, "hello");
      expect(reply.text).toBe(ANSWERS.invalidDecision);
    });

    it("refuses a capability the registry does not define", async () => {
      const { reply } = await say(
        "Sales over time",
        load("sales_time_series" as CapabilityId, y2025),
      );
      expect(reply.text).toContain("isn't available");
      expect(data.calls).toHaveLength(0);
    });

    it("asks to load data first when refining with no active result", async () => {
      const { reply } = await say(
        "Lowest first",
        refine({ sort: { field: "total_spend", direction: "asc" } }),
      );
      expect(reply.text).toBe(ANSWERS.noActiveResult);
    });
  });

  describe("limits (AC-11, AC-12)", () => {
    it("refuses a result over the row cap, storing nothing", async () => {
      const capped = new AnalysisOrchestrator(
        prisma,
        new ResultEngine(prisma),
        new ModelContextBuilder(prisma, new ResultEngine(prisma)),
        llm,
        data,
        new FakeClock(),
        { rowCap: 5 },
      );
      llm.push(load("customer_spending", y2025));
      const { reply, state } = await capped.handleMessage(authSessionId, userId, "Load");
      expect(reply.text).toBe(ANSWERS.rowCap("customer_spending", 10, 5));
      expect(state.activeResult).toBeNull();
      expect(await prisma.resultRow.count()).toBe(0);
    });

    it("stops after 200 messages without calling the model", async () => {
      await say("Load", load("customer_spending", y2025));
      await prisma.analysisSession.updateMany({ data: { messageCount: 200 } });
      const { reply } = await orchestrator.handleMessage(authSessionId, userId, "more");
      expect(reply.text).toBe(ANSWERS.messageLimit);
      expect(llm.calls).toHaveLength(1);
    });

    it("processes simultaneous messages one at a time (TD-7)", async () => {
      llm.push(load("customer_spending", y2025), refine({ limit: 5 }), refine({ limit: 7 }));
      await Promise.all([
        orchestrator.handleMessage(authSessionId, userId, "one"),
        orchestrator.handleMessage(authSessionId, userId, "two"),
        orchestrator.handleMessage(authSessionId, userId, "three"),
      ]);
      const seqs = (await prisma.analysisMessage.findMany({ orderBy: { seq: "asc" } })).map(
        (m) => m.seq,
      );
      expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
      expect(data.calls).toHaveLength(1);
    });
  });

  it("returns the same state after a refresh (AC-13)", async () => {
    const { state } = await say("Load", load("customer_spending", y2025, { limit: 3 }));
    expect(await orchestrator.getState(authSessionId, userId)).toEqual(state);
  });
});
