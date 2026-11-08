import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_ORIGIN,
  type TestApp,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookie,
} from "../test/app";
import { ANSWERS } from "./answers/answers";
import type { CapabilityId, Scope } from "./capabilities/registry";
import { DataSource } from "./data/data-source";

/**
 * The 12 scripted conversations of TASK-003 AC-17, driven through the HTTP API. The scripted model
 * is the demo model (DEC-001): the same fixed sentence → decision script the manual walkthrough
 * (AC-18) uses, so these tests and the walkthrough cover the same paths. Turns build on each other.
 */

interface Row {
  [key: string]: string | number;
}
interface State {
  activeResult: null | {
    capability: string;
    scope: { start_date: string; end_date: string };
    rowCount: number;
    filteredCount: number;
    rows: Row[];
    view: {
      filters: object[];
      sort: { field: string; direction: string };
      limit: number;
      view: string;
    };
  };
  pending: null | { type: string; [key: string]: unknown };
}
interface Turn {
  reply: { text: string; card?: Record<string, unknown> };
  state: State;
}

const y2025 = { start_date: "2025-01-01", end_date: "2026-01-01" };

describe("scripted conversations (TASK-003 AC-17)", () => {
  let t: TestApp;
  let token: string;
  /** Every retrieval made during the conversation. */
  const fetches: [CapabilityId, Scope][] = [];

  const say = async (text: string): Promise<Turn> => {
    const response = await request(t.app.getHttpServer())
      .post("/api/analysis/messages")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send({ text });
    expect(response.status).toBe(200);
    return response.body as Turn;
  };
  const press = async (choice: "switch" | "keep"): Promise<Turn> => {
    const response = await request(t.app.getHttpServer())
      .post("/api/analysis/switch")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", `cawb_session=${token}`)
      .send({ choice });
    expect(response.status).toBe(200);
    return response.body as Turn;
  };
  const values = (state: State, field: string) =>
    (state.activeResult?.rows ?? []).map((r) => Number(r[field]));

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    await createUser(t.prisma, "user@example.test", "pw-123456");
    const signIn = await request(t.app.getHttpServer())
      .post("/api/auth/sign-in")
      .set("Origin", TEST_ORIGIN)
      .send({ email: "user@example.test", password: "pw-123456" });
    token = sessionCookie(signIn) as string;
    const source = t.app.get(DataSource);
    const original = source.fetch.bind(source);
    source.fetch = (capability, scope) => {
      fetches.push([capability, scope]);
      return original(capability, scope);
    };
  });

  afterAll(async () => {
    await t.close();
  });

  it("1. 'Who spent the most last year?' asks calendar or trailing year, then loads the top 10", async () => {
    const ask = await say("Who spent the most last year?");
    expect(ask.reply.text).toBe(
      "Do you mean the previous calendar year (2025) or the last 12 months?",
    );
    expect(ask.state.activeResult).toBeNull();
    expect(fetches).toHaveLength(0);

    const { reply, state } = await say("The previous calendar year");
    expect(fetches).toHaveLength(1);
    expect(fetches.at(-1)).toEqual(["customer_spending", y2025]);
    expect(state.activeResult).toMatchObject({
      capability: "customer_spending",
      scope: y2025,
      view: { limit: 10, view: "bar" },
    });
    expect(state.activeResult?.rowCount).toBeGreaterThan(10);
    expect(state.activeResult?.rows).toHaveLength(10);
    const spend = values(state, "total_spend");
    expect(spend).toEqual([...spend].sort((a, b) => b - a));
    expect(reply.text).toContain("Showing 10 of");
    expect(state.pending).toBeNull();
  });

  it("2. 'Show the lowest spenders' re-sorts the stored rows", async () => {
    const { state } = await say("Show the lowest spenders");
    expect(fetches).toHaveLength(1);
    const spend = values(state, "total_spend");
    expect(spend).toEqual([...spend].sort((a, b) => a - b));
  });

  it("3. 'Only customers who spent over $500' filters the stored rows", async () => {
    const { reply, state } = await say("Only customers who spent over $500");
    expect(fetches).toHaveLength(1);
    const result = state.activeResult as NonNullable<State["activeResult"]>;
    expect(result.filteredCount).toBeGreaterThan(0);
    expect(result.filteredCount).toBeLessThan(result.rowCount);
    expect(values(state, "total_spend").every((v) => v > 500)).toBe(true);
    expect(reply.text).toContain("with total spend over $500.00");
  });

  it("4. 'top 10% of customers' is computed over the complete set while 10 filtered rows are displayed", async () => {
    const before = await say("Show this as a bar chart"); // unknown to the demo: only the reply changes
    const rowCount = before.state.activeResult?.rowCount as number;
    const { reply, state } = await say(
      "What share of spending comes from the top 10% of customers?",
    );
    expect(fetches).toHaveLength(1);
    expect(reply.card).toMatchObject({
      operation: "concentration",
      target: "complete",
      baseCount: rowCount,
      topRows: Math.ceil(rowCount / 10),
    });
    expect(reply.text).toMatch(
      new RegExp(
        `^Based on all ${rowCount.toLocaleString("en-US")} customers, 1 Jan 2025 – 31 Dec 2025: the top `,
      ),
    );
    expect(state.activeResult?.view).toEqual(before.state.activeResult?.view);
  });

  it("5. 'Show this as a table' changes the view only", async () => {
    const { reply, state } = await say("Show this as a table");
    expect(reply.text).toBe(ANSWERS.viewChanged("table"));
    expect(state.activeResult?.view.view).toBe("table");
    expect(fetches).toHaveLength(1);
  });

  it("6. 'Show it as a pie chart' is refused with bar and table offered", async () => {
    const { reply, state } = await say("Show it as a pie chart");
    expect(reply.text).toBe(
      "Pie charts aren't available yet. I can show this as a bar chart or a table.",
    );
    expect(state.activeResult?.view.view).toBe("table");
  });

  it("7. 'Who spent the most in 2023?' proposes a switch; Keep current keeps the result", async () => {
    const proposal = await say("Who spent the most in 2023?");
    expect(fetches).toHaveLength(1);
    expect(proposal.reply.text).toContain(
      "Your current result covers customer spending for 1 Jan 2025 – 31 Dec 2025.",
    );
    expect(proposal.state.pending).toMatchObject({
      type: "switch",
      capability: "customer_spending",
      scope: { start_date: "2023-01-01" },
    });

    const { reply, state } = await press("keep");
    expect(reply.text).toBe(ANSWERS.keepCurrent);
    expect(state.pending).toBeNull();
    expect(state.activeResult).toEqual(proposal.state.activeResult);
    expect(fetches).toHaveLength(1);
  });

  it("8. 'Why did customer spending decline?' gets a descriptive reply with an offer, and no data access", async () => {
    const before = (await say("Show the lowest spenders")).state;
    const { reply, state } = await say("Why did customer spending decline?");
    expect(reply.text).toContain("not explain why");
    expect(reply.text).toContain("I can show");
    expect(state.activeResult).toEqual(before.activeResult);
    expect(fetches).toHaveLength(1);
  });

  it("9. 'Show product sales instead' proposes a switch; Switch loads product sales", async () => {
    const proposal = await say("Show product sales instead");
    expect(proposal.state.pending).toMatchObject({
      type: "switch",
      capability: "product_sales_performance",
      scope: y2025,
    });
    expect(fetches).toHaveLength(1);

    const { reply, state } = await press("switch");
    expect(fetches).toHaveLength(2);
    expect(fetches.at(-1)).toEqual(["product_sales_performance", y2025]);
    expect(state.activeResult).toMatchObject({
      capability: "product_sales_performance",
      scope: y2025,
      view: { filters: [], view: "bar" },
    });
    expect(state.pending).toBeNull();
    expect(reply.text).toContain("products, 1 Jan 2025 – 31 Dec 2025, by revenue (highest first)");
    expect(await t.prisma.resultSet.count()).toBe(1);
  });

  it("10. 'Top-selling products' asks revenue or units, then sorts by the answer", async () => {
    const ask = await say("Top-selling products");
    expect(ask.reply.text).toBe("Do you mean top-selling by revenue or by units sold?");
    expect(ask.state.pending).toEqual({ type: "clarification", question: ask.reply.text });

    const { state } = await say("By revenue");
    expect(state.pending).toBeNull();
    expect(state.activeResult?.view.sort).toEqual({ field: "revenue", direction: "desc" });
    expect(fetches).toHaveLength(2);
  });

  it("11. 'Only the Jeans category' filters the stored rows", async () => {
    const { state } = await say("Only the Jeans category");
    expect(fetches).toHaveLength(2);
    expect(state.activeResult?.rows.length).toBeGreaterThan(0);
    expect(state.activeResult?.rows.every((r) => r.category === "Jeans")).toBe(true);
  });

  it("12. 'What's the weather today?' gets an unrelated reply and leaves the state unchanged", async () => {
    const before = (await say("Clear the filters")).state;
    const { reply, state } = await say("What's the weather today?");
    expect(reply.text).toBe(
      "I can only help with questions about customer spending and product sales in the sample data.",
    );
    expect(state.activeResult).toEqual(before.activeResult);
    expect(state.pending).toBeNull();
    expect(fetches).toHaveLength(2);
  });
});
