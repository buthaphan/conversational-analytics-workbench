import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ResultEngine } from "../engine/result-engine";
import { createTestPrisma, resetDatabase } from "../../test/database";
import { ModelContextBuilder } from "./model-context";

const prisma = createTestPrisma();
const builder = new ModelContextBuilder(prisma, new ResultEngine(prisma));
const hour = 60 * 60 * 1000;
const today = new Date("2026-11-08T09:00:00Z");

// Recognisable values that must never reach the model (decision C).
const SECRETS = [
  "Zelda Quartz",
  "CX-9991",
  "Yuri Plinth",
  "CX-9992",
  "98765.43",
  "98,765.43",
  "12345.67",
  "38.4%",
  "Moonlit Parka",
  "PX-7771",
];

async function seed(capability: "customer_spending" | "product_sales_performance") {
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
  const session = await prisma.analysisSession.create({
    data: { authSessionId: auth.id, userId: user.id },
  });
  const rows =
    capability === "customer_spending"
      ? [
          {
            customer_id: "CX-9991",
            customer_name: "Zelda Quartz",
            total_spend: 98765.43,
            order_count: 7,
            avg_order_value: 14109.35,
          },
          {
            customer_id: "CX-9992",
            customer_name: "Yuri Plinth",
            total_spend: 12345.67,
            order_count: 3,
            avg_order_value: 4115.22,
          },
        ]
      : [
          {
            product_id: "PX-7771",
            product_name: "Moonlit Parka",
            category: "Outerwear & Coats",
            revenue: 98765.43,
            item_count: 12,
          },
        ];
  const resultSet = await prisma.resultSet.create({
    data: {
      analysisSessionId: session.id,
      capability,
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      rowCount: rows.length,
      rows: { create: rows.map((data, rowIndex) => ({ rowIndex, data })) },
    },
  });
  await prisma.analysisSession.update({
    where: { id: session.id },
    data: {
      activeResultSetId: resultSet.id,
      viewSettings: {
        filters: [
          {
            field: capability === "customer_spending" ? "total_spend" : "revenue",
            op: "gt",
            value: 500,
          },
        ],
        sort: {
          field: capability === "customer_spending" ? "total_spend" : "revenue",
          direction: "desc",
        },
        limit: 10,
        view: "bar",
      },
      pendingAction: {
        type: "switch",
        capability: "product_sales_performance",
        scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      },
    },
  });
  // Earlier assistant answers contain figures and names; only their structured records may be used.
  await prisma.analysisMessage.createMany({
    data: [
      {
        analysisSessionId: session.id,
        seq: 1,
        role: "user",
        text: "Who spent the most last year?",
      },
      {
        analysisSessionId: session.id,
        seq: 2,
        role: "assistant",
        text: "Showing 2 of 2 customers… Zelda Quartz $98,765.43",
        payload: {
          decision: { action: "request_data", capability },
          outcome: { kind: "retrieved", rowCount: 2, filteredCount: 2, shown: 2 },
          card: { rows: [{ customer_name: "Zelda Quartz", total_spend: 98765.43 }] },
        },
      },
      {
        analysisSessionId: session.id,
        seq: 3,
        role: "user",
        text: "What share do the top 10% have?",
      },
      {
        analysisSessionId: session.id,
        seq: 4,
        role: "assistant",
        text: "Based on all 2 customers: the top 1 customers account for 38.4% of total spend ($12,345.67 of …)",
        payload: {
          decision: { action: "analyze", operation: "concentration" },
          outcome: { kind: "analysis", baseCount: 2 },
          card: { share: 0.384, topTotal: 12345.67 },
        },
      },
    ],
  });
  return session.id;
}

describe("model context (AC-5, TD-9)", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(["customer_spending", "product_sales_performance"] as const)(
    "never contains data rows, names, IDs, or computed figures (%s)",
    async (capability) => {
      const context = JSON.stringify(await builder.build(await seed(capability), today));
      for (const secret of SECRETS) expect(context, secret).not.toContain(secret);
    },
  );

  it("contains the catalogue, the active result summary, allowed values, recent turns, today, and the pending action", async () => {
    const context = await builder.build(await seed("product_sales_performance"), today);
    expect(context.today).toBe("2026-11-08");
    expect(context.catalogue.map((c) => c.id)).toEqual([
      "customer_spending",
      "product_sales_performance",
    ]);
    expect(
      context.catalogue[0]?.fields.find((f) => f.name === "total_spend")?.description,
    ).toContain("USD");
    expect(context.activeResult).toEqual({
      capability: "product_sales_performance",
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
      rowCount: 1,
      fields: ["product_id", "product_name", "category", "revenue", "item_count"],
      view: {
        filters: [{ field: "revenue", op: "gt", value: 500 }],
        sort: { field: "revenue", direction: "desc" },
        limit: 10,
        view: "bar",
      },
    });
    expect(context.allowedValues).toEqual({ category: ["Outerwear & Coats"] });
    expect(context.pending).toEqual({
      type: "switch",
      capability: "product_sales_performance",
      scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
    });
    expect(context.recentTurns).toEqual([
      { role: "user", text: "Who spent the most last year?" },
      {
        role: "assistant",
        decision: { action: "request_data", capability: "product_sales_performance" },
        outcome: { kind: "retrieved", rowCount: 2, filteredCount: 2, shown: 2 },
      },
      { role: "user", text: "What share do the top 10% have?" },
      {
        role: "assistant",
        decision: { action: "analyze", operation: "concentration" },
        outcome: { kind: "analysis", baseCount: 2 },
      },
    ]);
  });

  it("keeps only the last 10 turns (20 messages)", async () => {
    const sessionId = await seed("customer_spending");
    await prisma.analysisMessage.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        analysisSessionId: sessionId,
        seq: 10 + i,
        role: "user",
        text: `question ${i}`,
      })),
    });
    const context = await builder.build(sessionId, today);
    expect(context.recentTurns).toHaveLength(20);
    expect(context.recentTurns.at(-1)).toEqual({ role: "user", text: "question 29" });
  });

  it("has no active result or pending action for a new conversation", async () => {
    const user = await prisma.user.create({ data: { email: "n@example.test", passwordHash: "x" } });
    const now = new Date();
    const auth = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: "n",
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + hour),
      },
    });
    const session = await prisma.analysisSession.create({
      data: { authSessionId: auth.id, userId: user.id },
    });
    const context = await builder.build(session.id, today);
    expect(context).toMatchObject({
      activeResult: null,
      allowedValues: {},
      pending: null,
      recentTurns: [],
    });
  });
});
