import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ANSWERS, switchQuestion } from "../answers/answers";
import {
  CAPABILITIES,
  type CapabilityId,
  type EntityCapabilityId,
  type Scope,
} from "../capabilities/registry";
import { ModelContextBuilder } from "../context/model-context";
import { DataSource, type ResultRowData } from "../data/data-source";
import type { DailySalesRequest, DailySalesRow } from "../data/time-series";
import { ResultEngine } from "../engine/result-engine";
import { createTestPrisma, resetDatabase } from "../../test/database";
import { FakeClock } from "../../test/fake-clock";
import { ScriptedLlmClient } from "../../test/scripted-llm-client";
import { AnalysisOrchestrator, TurnInProgressError } from "./orchestrator";

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
  {
    product_id: "p1",
    product_name: "Slim Jeans",
    category: "Jeans",
    department: "Men",
    brand: "Northline",
    revenue: 100,
    item_count: 4,
  },
  {
    product_id: "p2",
    product_name: "Wool Sweater",
    category: "Sweaters",
    department: "Women",
    brand: "Saltmarsh",
    revenue: 200,
    item_count: 5,
  },
];

/** Counts retrievals and can be told to fail. */
class CountingDataSource extends DataSource {
  calls: { capability: EntityCapabilityId; scope: Scope }[] = [];
  seriesCalls: DailySalesRequest[] = [];
  fail = false;
  products = productRows;
  async fetch(capability: EntityCapabilityId, scope: Scope): Promise<ResultRowData[]> {
    this.calls.push({ capability, scope });
    if (this.fail) throw new Error("source unavailable");
    return capability === "customer_spending" ? customerRows : this.products;
  }
  /** One sale on each period's first day; the shared code fills the other days. */
  async fetchDailySales(request: DailySalesRequest): Promise<DailySalesRow[]> {
    this.seriesCalls.push(request);
    if (this.fail) throw new Error("source unavailable");
    return request.periods.map(({ period, scope }) => ({
      period,
      date: scope.start_date,
      revenue: 10,
      order_count: 1,
      item_count: 2,
    }));
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
      // TASK-005 AC-9: pie exists now, but customer rows are not parts of a whole.
      expect(result.reply.text).toBe(
        "A pie chart doesn't suit this result: it shows parts of a whole, and this result lists individual customers. I can show it as a bar chart, a horizontal bar chart, or a table.",
      );
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

    it("checks a brand filter against the stored brands without listing them, also in the pending question (TASK-005 AC-2)", async () => {
      await say("Load products", load("product_sales_performance", y2025));
      const refused = await say(
        "Only Southline",
        refine({ filters: [{ field: "brand", op: "in", values: ["Southline"] }] }),
      );
      expect(refused.reply.text).toContain('no brand named "Southline"');
      for (const text of [refused.reply.text, JSON.stringify(refused.state.pending)]) {
        expect(text).not.toContain("Northline");
        expect(text).not.toContain("Saltmarsh");
      }
      const { state } = await say(
        "Only Northline",
        refine({ filters: [{ field: "brand", op: "in", values: ["Northline"] }] }),
      );
      expect(state.activeResult?.rows.map((r) => r.product_id)).toEqual(["p1"]);
      expect(data.calls).toHaveLength(1);
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

    it.each([
      ["the Switch button", () => orchestrator.handleSwitch(authSessionId, userId, "switch")],
      ["the Keep current button", () => orchestrator.handleSwitch(authSessionId, userId, "keep")],
      [
        "a confirming reply",
        () => say("Yes", { ...base, action: { type: "confirm_switch", accept: true } }),
      ],
    ])(
      "changes nothing when %s confirms with no switch pending (review R4)",
      async (_, confirm) => {
        const question = "Highest spend or most orders?";
        await say("Best", { ...base, need: "unclear", action: { type: "clarify", question } });
        const { reply, state } = await confirm();
        expect(reply.text).toBe(ANSWERS.noPendingSwitch);
        expect(state.pending).toEqual({ type: "clarification", question });
        expect(data.calls).toHaveLength(1);
      },
    );

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
      // TASK-005 defines sales_time_series; another catalogue capability stays undefined.
      const { reply } = await say(
        "Which customers came back?",
        load("repeat_purchase_behavior" as CapabilityId, y2025),
      );
      expect(reply.text).toContain("isn't available");
      expect(data.calls).toHaveLength(0);
      expect(data.seriesCalls).toHaveLength(0);
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
    const capRows = (n: number): ResultRowData[] =>
      Array.from({ length: n }, (_, i) => ({
        customer_id: `c${i}`,
        customer_name: `Customer ${i}`,
        total_spend: (i % 997) + 0.5,
        order_count: (i % 7) + 1,
        avg_order_value: 1,
      }));
    const withOptions = (options: { rowCap?: number }) =>
      new AnalysisOrchestrator(
        prisma,
        new ResultEngine(prisma),
        new ModelContextBuilder(prisma, new ResultEngine(prisma)),
        llm,
        data,
        new FakeClock(),
        options,
      );

    it("cannot raise the registry cap through the option (TASK-004 AC-8, review N2)", async () => {
      const cap = CAPABILITIES.customer_spending.rowCap;
      data.fetch = async () => capRows(cap + 1);
      llm.push(load("customer_spending", y2025));
      const { reply } = await withOptions({ rowCap: cap * 10 }).handleMessage(
        authSessionId,
        userId,
        "Load",
      );
      expect(reply.text).toBe(ANSWERS.rowCap("customer_spending", cap + 1, cap));
      expect(await prisma.resultRow.count()).toBe(0);
    }, 60_000);

    it("stores a result at the cap within the turn deadline (TASK-004 AC-8)", async () => {
      const cap = CAPABILITIES.customer_spending.rowCap;
      data.fetch = async () => capRows(cap);
      llm.push(load("customer_spending", y2025));
      const started = Date.now();
      const { state } = await orchestrator.handleMessage(authSessionId, userId, "Load");
      const elapsed = Date.now() - started;
      console.log(`Stored ${cap} rows in ${elapsed} ms.`);
      expect(state.activeResult?.rowCount).toBe(cap);
      expect(elapsed).toBeLessThan(30_000);
    }, 120_000);

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

    it("refuses an over-cap switch, keeping the current result (review R10a)", async () => {
      const capped = new AnalysisOrchestrator(
        prisma,
        new ResultEngine(prisma),
        new ModelContextBuilder(prisma, new ResultEngine(prisma)),
        llm,
        data,
        new FakeClock(),
        { rowCap: 5 },
      );
      llm.push(load("product_sales_performance", y2025), load("customer_spending", y2025));
      await capped.handleMessage(authSessionId, userId, "Products"); // 2 rows: within the cap
      await capped.handleMessage(authSessionId, userId, "Customers"); // proposes a switch
      const { reply, state } = await capped.handleSwitch(authSessionId, userId, "switch");
      expect(reply.text).toBe(ANSWERS.rowCap("customer_spending", 10, 5));
      expect(state.activeResult).toMatchObject({
        capability: "product_sales_performance",
        rowCount: 2,
      });
      expect(await prisma.resultSet.count()).toBe(1);
      expect(await prisma.resultRow.count()).toBe(2);
    });

    it("stops after 200 messages without calling the model, and says so in the state (review R2)", async () => {
      await say("Load", load("customer_spending", y2025));
      expect((await orchestrator.getState(authSessionId, userId)).notice).toBeNull();
      await prisma.analysisSession.updateMany({ data: { messageCount: 199 } });
      expect((await orchestrator.getState(authSessionId, userId)).notice).toBe(
        ANSWERS.messageLimit,
      );
      const { reply, state } = await orchestrator.handleMessage(authSessionId, userId, "more");
      expect(reply.text).toBe(ANSWERS.messageLimit);
      expect(state.notice).toBe(ANSWERS.messageLimit);
      expect(llm.calls).toHaveLength(1);
    });

    it("keeps the result consistent when a switch is confirmed while a message arrives (review R10b)", async () => {
      await say("Load", load("customer_spending", y2025));
      await say("Products", load("product_sales_performance", y2025));
      llm.push(refine({ limit: 5 }));
      const results = await Promise.allSettled([
        orchestrator.handleSwitch(authSessionId, userId, "switch"),
        orchestrator.handleMessage(authSessionId, userId, "five rows"),
      ]);
      const sets = await prisma.resultSet.findMany();
      expect(sets).toHaveLength(1);
      const session = await prisma.analysisSession.findFirstOrThrow();
      expect(session.activeResultSetId).toBe(sets[0]?.id);
      expect(session.turnId).toBeNull();
      const seqs = (await prisma.analysisMessage.findMany({ orderBy: { seq: "asc" } })).map(
        (m) => m.seq,
      );
      const state = await orchestrator.getState(authSessionId, userId);
      // Since TASK-004 DEC-001 one of them may be refused while the other runs; nothing changes then.
      const refused = results.filter((r) => r.status === "rejected");
      for (const r of refused) expect(r.reason).toBeInstanceOf(TurnInProgressError);
      if (refused.length === 1) {
        expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
        return;
      }
      expect(session.pendingAction).toBeNull();
      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      // Either order is valid: switch first (products, then limit 5), or the message first
      // (it clears the pending switch, so the button finds nothing to confirm).
      if (state.activeResult?.capability === "product_sales_performance") {
        expect(data.calls).toHaveLength(2);
        expect(state.activeResult.view.limit).toBe(5);
      } else {
        expect(data.calls).toHaveLength(1);
        expect(state.activeResult?.view.limit).toBe(5);
        expect(state.messages.at(-1)?.text).toBe(ANSWERS.noPendingSwitch);
      }
    });

    it("runs one turn at a time and refuses the others (TD-7, TASK-004 DEC-001)", async () => {
      llm.push(load("customer_spending", y2025), refine({ limit: 5 }), refine({ limit: 7 }));
      const results = await Promise.allSettled([
        orchestrator.handleMessage(authSessionId, userId, "one"),
        orchestrator.handleMessage(authSessionId, userId, "two"),
        orchestrator.handleMessage(authSessionId, userId, "three"),
      ]);
      const accepted = results.filter((r) => r.status === "fulfilled").length;
      expect(accepted).toBeGreaterThanOrEqual(1);
      for (const r of results)
        if (r.status === "rejected") expect(r.reason).toBeInstanceOf(TurnInProgressError);
      const seqs = (await prisma.analysisMessage.findMany({ orderBy: { seq: "asc" } })).map(
        (m) => m.seq,
      );
      expect(seqs).toEqual(Array.from({ length: 2 * accepted }, (_, i) => i + 1));
      expect(data.calls).toHaveLength(1);
    });
  });

  it("returns the same state after a refresh (AC-13)", async () => {
    const { state } = await say("Load", load("customer_spending", y2025, { limit: 3 }));
    expect(await orchestrator.getState(authSessionId, userId)).toEqual(state);
  });

  describe("views and chart rules (TASK-005 AC-9)", () => {
    const view = (name: string) => ({ ...base, action: { type: "change_view", view: name } });
    const SHAPES = {
      rows: async () => {
        await say("Customers", load("customer_spending", y2025));
      },
      groups: async () => {
        await say("Products", load("product_sales_performance", y2025));
        await say("By category", refine({ group_by: "category" }));
      },
      series: async () => {
        await say("Monthly", {
          ...load("customer_spending", y2025),
          action: { type: "request_data", capability: "sales_time_series", scope: y2025 },
        });
      },
    };
    const START = { rows: "bar", groups: "bar", series: "line" };
    const REFUSED: Record<string, string> = {
      "rows:line":
        "A line chart doesn't suit this result: it shows change over time, and this result has no dates. I can show it as a bar chart, a horizontal bar chart, or a table.",
      "rows:pie":
        "A pie chart doesn't suit this result: it shows parts of a whole, and this result lists individual customers. I can show it as a bar chart, a horizontal bar chart, or a table.",
      "groups:line":
        "A line chart doesn't suit this result: it shows change over time, and this result has no dates. I can show it as a bar chart, a horizontal bar chart, a pie chart, or a table.",
      "series:horizontal_bar":
        "A horizontal bar chart doesn't suit this result: sales over time is shown in date order. I can show it as a line chart, a bar chart, or a table.",
      "series:pie":
        "A pie chart doesn't suit this result: sales over time is shown in date order. I can show it as a line chart, a bar chart, or a table.",
    };
    const CASES = (["rows", "groups", "series"] as const).flatMap((shape) =>
      (["bar", "horizontal_bar", "line", "pie", "table"] as const).map((v) => [shape, v] as const),
    );

    it.each(CASES)("%s result, %s view", async (shape, v) => {
      await SHAPES[shape]();
      const retrievals = data.calls.length + data.seriesCalls.length;
      const { reply, state } = await say("View", view(v));
      const refusal = REFUSED[`${shape}:${v}`];
      if (refusal) {
        expect(reply.text).toBe(refusal);
        expect(state.activeResult?.view.view).toBe(START[shape]);
      } else {
        expect(state.activeResult?.view.view).toBe(v);
        if (v !== "pie") expect(reply.text).toBe(ANSWERS.viewChanged(v));
      }
      expect(data.calls.length + data.seriesCalls.length).toBe(retrievals);
      expect(state.pending).toBeNull();
    });

    it("normalizes common names, and refuses an unknown chart type listing the suitable views", async () => {
      await SHAPES.series();
      let { state } = await say("Bars", view("Bar chart"));
      expect(state.activeResult?.view.view).toBe("bar");
      ({ state } = await say("Lines", view("line graph")));
      expect(state.activeResult?.view.view).toBe("line");
      const { reply } = await say("Scatter", view("scatter plot"));
      expect(reply.text).toBe(
        "Scatter plot charts aren't available. I can show it as a line chart, a bar chart, or a table.",
      );
    });

    it("draws a pie of the 5 largest groups plus Other, saying how many groups Other holds", async () => {
      data.products = Array.from({ length: 7 }, (_, i) => ({
        ...productRows[0],
        product_id: `p${i + 1}`,
        category: `Cat ${i + 1}`,
        revenue: (i + 1) * 10,
      })) as ResultRowData[];
      await SHAPES.groups();
      const { reply, state } = await say("Pie", view("pie chart"));
      expect(reply.text).toBe(
        'Showing the result as a pie chart of the 5 largest categories by revenue; the other 2 are combined as "Other".',
      );
      expect(state.activeResult?.grouped?.pie?.slices.map((s) => s.key)).toEqual([
        "Cat 7",
        "Cat 6",
        "Cat 5",
        "Cat 4",
        "Cat 3",
      ]);
      expect(state.activeResult?.grouped?.pie?.other).toMatchObject({ groups: 2, revenue: 30 });
      // The table still lists every group.
      expect(state.activeResult?.grouped?.groups).toHaveLength(7);
    });

    it("draws every group as a slice when there are at most 6", async () => {
      await SHAPES.groups();
      const { reply } = await say("Pie", view("pie"));
      expect(reply.text).toBe("Showing the result as a pie chart of 2 categories by revenue.");
    });

    it("returns to the shape's default view when the current one no longer suits it", async () => {
      await SHAPES.groups();
      await say("Pie", view("pie"));
      const { state } = await say("Products again", refine({ group_by: "none" }));
      expect(state.activeResult?.view.view).toBe("bar");
    });

    it("keeps a view that still suits the new shape", async () => {
      await SHAPES.groups();
      await say("Horizontal", view("horizontal bars"));
      const { state } = await say("Products again", refine({ group_by: "none" }));
      expect(state.activeResult?.view.view).toBe("horizontal_bar");
    });
  });

  describe("grouped view of product results (TASK-005 AC-8)", () => {
    const analyze = (analysis: object) => ({
      ...base,
      need: "analysis_on_current",
      action: { type: "analyze", analysis },
    });

    it("loads straight into a grouped view when the first request asks for it", async () => {
      const { reply, state } = await say(
        "Revenue by category in 2025",
        load("product_sales_performance", y2025, { group_by: "category" }),
      );
      expect(state.activeResult?.view.group_by).toBe("category");
      expect(state.activeResult?.grouped?.groups.map((g) => g.key)).toEqual(["Sweaters", "Jeans"]);
      expect(reply.text).toBe(
        "Showing 2 categories by revenue (highest first), 1 Jan 2025 – 31 Dec 2025.",
      );
    });

    it("refuses grouping customers, with an alternative", async () => {
      await say("Customers", load("customer_spending", y2025));
      const { reply, state } = await say("By category", refine({ group_by: "category" }));
      expect(reply.text).toBe(
        "Customer spending can't be grouped. Ask for product sales grouped by category, department, or brand instead.",
      );
      expect(state.activeResult?.view.group_by).toBeUndefined();
      expect(state.activeResult?.grouped).toBeUndefined();
    });

    describe("with product sales loaded", () => {
      beforeEach(async () => {
        await say("Products", load("product_sales_performance", y2025));
      });

      it("groups by category without retrieving", async () => {
        const { state } = await say("By category", refine({ group_by: "category" }));
        expect(data.calls).toHaveLength(1);
        expect(state.activeResult?.grouped).toMatchObject({
          groupBy: "category",
          groupCount: 2,
          groups: [
            { key: "Sweaters", product_count: 1, revenue: 200, item_count: 5 },
            { key: "Jeans", product_count: 1, revenue: 100, item_count: 4 },
          ],
          other: null,
        });
        // The product rows stay available; the main view shows the groups.
        expect(state.activeResult?.rows).toHaveLength(2);
      });

      it("shows the user's number of brands with an exact Other row, keeping the product row limit", async () => {
        const { reply, state } = await say("Top brand", refine({ group_by: "brand", limit: 1 }));
        expect(state.activeResult?.view).toMatchObject({
          group_by: "brand",
          groupLimit: 1,
          limit: 10,
        });
        expect(state.activeResult?.grouped?.groups.map((g) => g.key)).toEqual(["Saltmarsh"]);
        expect(state.activeResult?.grouped?.other).toEqual({
          key: "Other",
          groups: 1,
          product_count: 1,
          revenue: 100,
          item_count: 4,
        });
        expect(reply.text).toBe(
          'Showing the top 1 of 2 brands by revenue (highest first), 1 Jan 2025 – 31 Dec 2025; 1 other brand is combined as "Other".',
        );
      });

      it("defaults to the top 20 brands", async () => {
        const { state } = await say("By brand", refine({ group_by: "brand" }));
        expect(state.activeResult?.view.groupLimit).toBe(20);
        expect(state.activeResult?.grouped?.groups).toHaveLength(2);
      });

      it("returns to product rows on group_by none", async () => {
        await say("By department", refine({ group_by: "department" }));
        const { state } = await say("Show products again", refine({ group_by: "none" }));
        expect(state.activeResult?.view.group_by).toBeUndefined();
        expect(state.activeResult?.grouped).toBeUndefined();
      });

      it("refuses a brand number over 30", async () => {
        const { reply, state } = await say(
          "Top 40 brands",
          refine({ group_by: "brand", limit: 40 }),
        );
        expect(reply.text).toBe("Show between 1 and 30 brands.");
        expect(state.activeResult?.view.group_by).toBeUndefined();
      });

      it("runs analyses on the product rows while grouped, and refuses the displayed target", async () => {
        await say("By category", refine({ group_by: "category" }));
        const summary = await say(
          "Revenue summary",
          analyze({ operation: "summary", field: "revenue" }),
        );
        expect(summary.reply.card).toMatchObject({ baseCount: 2, total: 300 });
        const { reply } = await say(
          "Summary of these",
          analyze({ operation: "summary", field: "revenue", target: "displayed" }),
        );
        expect(reply.text).toBe(
          "While grouped, analyses run on the products, not on the groups shown. Ask about all products or the filtered products instead.",
        );
        expect(reply.card).toBeUndefined();
      });

      it("returns the same state after a refresh", async () => {
        const { state } = await say("By brand", refine({ group_by: "brand" }));
        expect(await orchestrator.getState(authSessionId, userId)).toEqual(state);
      });
    });
  });

  describe("sales over time: loading, same data, and switching (TASK-005 AC-6)", () => {
    const y2024: Scope = { start_date: "2024-01-01", end_date: "2025-01-01" };
    const series = (scope?: Partial<Scope>, parameters?: object, refinement?: object) => ({
      relevance: "other_capability",
      need: "new_data",
      action: {
        type: "request_data",
        capability: "sales_time_series",
        ...(scope ? { scope } : {}),
        ...(parameters ? { parameters } : {}),
        ...(refinement ? { refinement } : {}),
      },
    });
    const jeans = { product_filter: { field: "category", values: ["Jeans"] } };
    const lastYear = { comparison: { baseline: "previous_year" } };
    const main2025 = { period: "main", scope: y2025 };
    const comparison2024 = { period: "comparison", scope: y2024 };

    it("retrieves daily rows on the first request and shows them by the default interval", async () => {
      const { reply, state } = await say("Monthly sales in 2025", series(y2025));
      expect(data.seriesCalls).toEqual([{ periods: [main2025] }]);
      expect(data.calls).toHaveLength(0);
      expect(state.pending).toBeNull();
      expect(state.activeResult).toMatchObject({
        capability: "sales_time_series",
        scope: y2025,
        parameters: {},
        rowCount: 365,
        view: { view: "line", interval: "month", measure: "revenue" },
      });
      expect(state.activeResult?.series?.main).toHaveLength(12);
      expect(state.activeResult?.series?.main[0]).toMatchObject({ label: "Jan 2025", revenue: 10 });
      expect(state.activeResult?.series?.comparison).toBeUndefined();
      expect(state.activeResult?.comparisonScope).toBeUndefined();
      expect(reply.text).toContain("1 Jan 2025 – 31 Dec 2025");
    });

    it("retrieves both periods with the product filter, and stores the parameters", async () => {
      const { state } = await say("Jeans vs last year", series(y2025, { ...jeans, ...lastYear }));
      expect(data.seriesCalls).toEqual([
        { periods: [main2025, comparison2024], productFilter: jeans.product_filter },
      ]);
      expect(state.activeResult?.parameters).toEqual({ ...jeans, ...lastYear });
      // The web shows the comparison dates without computing them (TASK-005 AC-11).
      expect(state.activeResult?.comparisonScope).toEqual(y2024);
      expect(state.activeResult?.rowCount).toBe(365 + 366);
      expect(state.activeResult?.series?.comparison).toHaveLength(12);
      expect(state.activeResult?.series?.totals.change).toBeDefined();
    });

    it("applies the requested interval and measure on load", async () => {
      const { state } = await say(
        "Weekly orders in 2025",
        series(y2025, undefined, { interval: "week", measure: "order_count" }),
      );
      expect(state.activeResult?.view).toMatchObject({ interval: "week", measure: "order_count" });
      expect(state.activeResult?.series?.main).toHaveLength(53);
    });

    it("treats the same comparison period and the same filter values in another order as the same data", async () => {
      const both = { product_filter: { field: "category", values: ["Jeans", "Shorts"] } };
      const custom = {
        comparison: { baseline: "custom", start_date: "2024-01-01", end_date: "2025-01-01" },
      };
      await say("Load", series(y2025, { ...both, ...custom }));
      const reordered = { product_filter: { field: "category", values: ["Shorts", "Jeans"] } };
      const { state } = await say(
        "Same, weekly",
        series(y2025, { ...reordered, ...lastYear }, { interval: "week" }),
      );
      expect(data.seriesCalls).toHaveLength(1);
      expect(state.pending).toBeNull();
      expect(state.activeResult?.view.interval).toBe("week");
    });

    it("proposes removing a comparison as a switch", async () => {
      await say("Load", series(y2025, lastYear));
      const { reply, state } = await say("Without the comparison", series(y2025));
      expect(data.seriesCalls).toHaveLength(1);
      expect(reply.text).toContain("no comparison");
      expect(state.pending).toMatchObject({ type: "switch", parameters: {} });
    });

    describe("with a filtered series loaded", () => {
      beforeEach(async () => {
        await say("Monthly Jeans sales in 2025", series(y2025, jeans));
      });

      it("changes the interval and the measure without retrieving", async () => {
        let { state } = await say("Weekly", refine({ interval: "week" }));
        expect(state.activeResult?.series?.main).toHaveLength(53);
        ({ state } = await say("Items instead", refine({ measure: "item_count" })));
        expect(state.activeResult?.view).toMatchObject({ interval: "week", measure: "item_count" });
        expect(state.activeResult?.series?.measure).toBe("item_count");
        expect(data.seriesCalls).toHaveLength(1);
      });

      it("treats a repeated request for the same data as a view change", async () => {
        const { state } = await say(
          "Jeans by week",
          series(
            y2025,
            { product_filter: { field: "category", values: ["Jeans"] } },
            {
              interval: "week",
            },
          ),
        );
        expect(data.seriesCalls).toHaveLength(1);
        expect(state.pending).toBeNull();
        expect(state.activeResult?.view.interval).toBe("week");
      });

      it.each([
        [
          "a different filter",
          series(y2025, { product_filter: { field: "category", values: ["Tops & Tees"] } }),
          "only Tops & Tees",
        ],
        ["no filter", series(y2025), "all products"],
        [
          "a department filter",
          series(y2025, { product_filter: { field: "department", values: ["Women"] } }),
          "only Women",
        ],
        [
          "an added comparison",
          series(y2025, { ...jeans, ...lastYear }),
          "adds a comparison with 1 Jan 2024 – 31 Dec 2024",
        ],
        ["a different scope", series(y2024, jeans), "the period 1 Jan 2024 – 31 Dec 2024"],
      ])(
        "proposes %s as a switch, naming the change, without retrieving",
        async (_, decision, phrase) => {
          const { reply, state } = await say("Change", decision);
          expect(data.seriesCalls).toHaveLength(1);
          expect(reply.text).toContain(
            "Your current result covers sales over time for 1 Jan 2025 – 31 Dec 2025, only Jeans.",
          );
          expect(reply.text).toContain(phrase);
          expect(state.pending).toMatchObject({ type: "switch", capability: "sales_time_series" });
          expect(state.activeResult?.parameters).toEqual(jeans);
        },
      );

      it("retrieves only when the switch is confirmed, then replaces the series", async () => {
        await say("Compare with last year", series(y2025, { ...jeans, ...lastYear }));
        expect(data.seriesCalls).toHaveLength(1);
        const { state } = await orchestrator.handleSwitch(authSessionId, userId, "switch");
        expect(data.seriesCalls).toHaveLength(2);
        expect(data.seriesCalls[1]).toEqual({
          periods: [main2025, comparison2024],
          productFilter: jeans.product_filter,
        });
        expect(state.activeResult?.parameters).toEqual({ ...jeans, ...lastYear });
        expect(state.pending).toBeNull();
        expect(await prisma.resultSet.count()).toBe(1);
      });

      it("asks again for an unknown category, listing the options, without retrieving", async () => {
        const { reply, state } = await say(
          "Hats",
          series(y2025, { product_filter: { field: "category", values: ["Hats"] } }),
        );
        expect(reply.text).toContain("Options: Accessories, Active");
        expect(state.pending).toMatchObject({ type: "clarification" });
        expect(data.seriesCalls).toHaveLength(1);
      });

      it("refuses daily figures over 366 days, offering week or month", async () => {
        const { reply } = await say(
          "Daily for two years",
          series({ start_date: "2024-01-01", end_date: "2026-01-01" }, jeans, { interval: "day" }),
        );
        expect(reply.text).toContain("Options: week, month.");
        expect(data.seriesCalls).toHaveLength(1);
      });

      it("allows daily figures for the loaded 365-day series, and refuses an unknown measure", async () => {
        const daily = await say("Daily", refine({ interval: "day" }));
        expect(daily.state.activeResult?.series?.main).toHaveLength(365);
        // The decision schema rejects an unknown measure (walkthrough W2); the registry's own
        // check stays as a second guard (registry tests).
        const { reply, state } = await say("Profit", refine({ measure: "profit" }));
        expect(reply.text).toBe(ANSWERS.invalidDecision);
        expect(state.activeResult?.view.measure).toBe("revenue");
      });

      describe("what applies to the series (TASK-005 AC-7)", () => {
        const analyze = (analysis: object) => ({
          ...base,
          need: "analysis_on_current",
          action: { type: "analyze", analysis },
        });

        it("summarizes the period's buckets, naming the lowest and highest", async () => {
          // The test source sells $10 on the period's first day only.
          const { reply, state } = await say(
            "Summary",
            analyze({ operation: "summary", field: "revenue" }),
          );
          expect(reply.text).toBe(
            "Based on all 12 months, 1 Jan 2025 – 31 Dec 2025, only Jeans: revenue totals $10.00, average $0.83 per month, median $0.00, lowest $0.00 (Feb 2025), highest $10.00 (Jan 2025).",
          );
          expect(reply.card).toMatchObject({
            operation: "summary",
            baseCount: 12,
            field: "revenue",
            total: 10,
            min: 0,
            max: 10,
            buckets: { interval: "month", lowest: "Feb 2025", highest: "Jan 2025" },
            rowNoun: ["month", "months"],
          });
          expect(state.activeResult?.view).toMatchObject({ interval: "month" });
          expect(data.seriesCalls).toHaveLength(1);
        });

        it("summarizes the charted measure when none is named, by the current interval", async () => {
          await say("Weekly items", refine({ interval: "week", measure: "item_count" }));
          const { reply } = await say("Summary", analyze({ operation: "summary" }));
          expect(reply.card).toMatchObject({ baseCount: 53, field: "item_count", total: 2 });
          expect(reply.text).toContain("Based on all 53 weeks");
          expect(reply.text).toContain("highest 2 (Week of 30 Dec 2024)");
        });

        it.each([
          [
            "sorting by value",
            refine({ sort: { field: "revenue", direction: "desc" } }),
            "Sales over time is shown in date order. Ask for the highest or lowest month instead.",
          ],
          [
            "a row limit",
            refine({ limit: 3 }),
            "Sales over time is shown in date order. Ask for the highest or lowest month instead.",
          ],
          [
            "a measure filter",
            refine({ filters: [{ field: "revenue", op: "gt", value: 5 }] }),
            "Sales over time shows every month, so it can't be filtered by value. Ask for the highest or lowest month instead.",
          ],
          [
            "grouping",
            refine({ group_by: "category" }),
            "Sales over time can't be grouped. Ask for product sales grouped by category, department, or brand instead.",
          ],
          [
            "a concentration analysis",
            analyze({ operation: "concentration", measure: "revenue", top_percent: 10 }),
            "Concentration compares customers or products, not sales over time. Ask for a summary to see the lowest and highest periods instead.",
          ],
        ])("refuses %s with an alternative, changing nothing", async (_, decision, message) => {
          const before = (await orchestrator.getState(authSessionId, userId)).activeResult;
          const { reply, state } = await say("Try", decision);
          expect(reply.text).toBe(message);
          expect(reply.card).toBeUndefined();
          expect(state.activeResult).toEqual(before);
          expect(data.seriesCalls).toHaveLength(1);
        });
      });

      it("returns the same state after a refresh", async () => {
        const { state } = await say("Weekly", refine({ interval: "week" }));
        expect(await orchestrator.getState(authSessionId, userId)).toEqual(state);
      });

      it("gives the model the active series' parameters and view settings", async () => {
        await say("Weekly", refine({ interval: "week" }));
        const context = llm.calls.at(-1)?.context;
        expect(context?.activeResult).toMatchObject({
          capability: "sales_time_series",
          parameters: jeans,
          view: { interval: "month", measure: "revenue" },
        });
      });
    });

    it("refuses time-series parameters on another capability without retrieving", async () => {
      const decision = load("customer_spending", y2025);
      const { reply, state } = await say("Customers, Jeans only", {
        ...decision,
        action: { ...decision.action, parameters: jeans },
      });
      expect(reply.text).toBe(
        "Intervals, measures, product filters, and comparisons apply only to sales over time.",
      );
      expect(state.activeResult).toBeNull();
      expect(data.calls).toHaveLength(0);
    });

    it("proposes a switch from product sales to a series, describing the series", async () => {
      await say("Products", load("product_sales_performance", y2025));
      const { reply } = await say("Jeans sales over time", series(undefined, jeans));
      expect(reply.text).toBe(
        switchQuestion(
          { capability: "product_sales_performance", scope: y2025 },
          { capability: "sales_time_series", scope: y2025, parameters: jeans as never },
        ),
      );
      expect(reply.text).toContain("sales over time for 1 Jan 2025 – 31 Dec 2025, only Jeans");
      expect(data.seriesCalls).toHaveLength(0);
    });

    it("loads a short period with a long comparison by month, and then changes its measure (task review SF-1)", async () => {
      const short = { start_date: "2025-01-01", end_date: "2025-01-21" };
      const custom = {
        comparison: { baseline: "custom", start_date: "2022-01-01", end_date: "2024-01-01" },
      };
      const loaded = await say("Jan vs 2022-2023", series(short, custom));
      expect(data.seriesCalls).toHaveLength(1);
      expect(loaded.state.activeResult?.view.interval).toBe("month");
      const { reply, state } = await say("Orders instead", refine({ measure: "order_count" }));
      expect(reply.text).not.toContain("Choose weekly or monthly");
      expect(state.activeResult?.view).toMatchObject({ interval: "month", measure: "order_count" });
    });

    it("cuts the series off at today and marks the current month partial", async () => {
      const { state } = await say(
        "This year",
        series({ start_date: "2026-01-01", end_date: "2027-01-01" }),
      );
      // FakeClock: 2026-11-08.
      expect(state.activeResult?.rowCount).toBe(312);
      expect(state.activeResult?.series?.main.at(-1)).toMatchObject({
        label: "Nov 2026",
        lastDay: "2026-11-08",
        partial: true,
      });
    });
  });
});
