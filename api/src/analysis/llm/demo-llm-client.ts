import { ANSWERS } from "../answers/answers";
import type { ModelContext } from "../context/model-context";
import type { DecisionAction, TurnDecision } from "../decision/turn-decision";
import { LlmClient } from "./llm-client";

/**
 * Development demo model (TASK-003 AC-15, DEC-001, TD-11). It recognises a fixed list of example
 * sentences and returns the TurnDecision a real model should return, so the whole workflow can be
 * clicked through in a browser without credentials. It does not understand other text. The API
 * refuses to start with it in production (see config.ts).
 */

type Build = (today: string) => {
  relevance: TurnDecision["relevance"];
  need: TurnDecision["need"];
  action: DecisionAction;
};

const year = (y: number) => ({ start_date: `${y}-01-01`, end_date: `${y + 1}-01-01` });
const lastYear = (today: string) => year(Number(today.slice(0, 4)) - 1);
const trailingYear = (today: string) => ({
  start_date: `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`,
  end_date: today,
});

const onActive = { relevance: "active_result", need: "answerable_now" } as const;
const newData = { relevance: "other_capability", need: "new_data" } as const;
const refine =
  (refinement: object): Build =>
  () => ({ ...onActive, action: { type: "refine", refinement } });

/** Example sentence (as shown to the user) → decision. Keys are normalized when looked up. */
const SCRIPT: [string, Build][] = [
  [
    "Who spent the most last year?",
    (today) => {
      const y = lastYear(today).start_date.slice(0, 4);
      return {
        relevance: "other_capability",
        need: "unclear",
        action: {
          type: "clarify",
          question: `Do you mean the previous calendar year (${y}) or the last 12 months?`,
        },
      };
    },
  ],
  [
    "The previous calendar year",
    (today) => ({
      ...newData,
      action: {
        type: "request_data",
        capability: "customer_spending",
        scope: lastYear(today),
        refinement: { sort: { field: "total_spend", direction: "desc" }, limit: 10 },
      },
    }),
  ],
  [
    "The last 12 months",
    (today) => ({
      ...newData,
      action: {
        type: "request_data",
        capability: "customer_spending",
        scope: trailingYear(today),
        refinement: { sort: { field: "total_spend", direction: "desc" }, limit: 10 },
      },
    }),
  ],
  ["Show the lowest spenders", refine({ sort: { field: "total_spend", direction: "asc" } })],
  [
    "Only customers who spent over $500",
    refine({ filters: [{ field: "total_spend", op: "gt", value: 500 }] }),
  ],
  [
    "What share of spending comes from the top 10% of customers?",
    () => ({
      relevance: "active_result",
      need: "analysis_on_current",
      action: {
        type: "analyze",
        analysis: {
          operation: "concentration",
          measure: "total_spend",
          top_percent: 10,
          target: "complete",
        },
      },
    }),
  ],
  ["Show this as a table", () => ({ ...onActive, action: { type: "change_view", view: "table" } })],
  ["Show it as a pie chart", () => ({ ...onActive, action: { type: "change_view", view: "pie" } })],
  [
    "Who spent the most in 2023?",
    () => ({
      ...newData,
      action: {
        type: "request_data",
        capability: "customer_spending",
        scope: year(2023),
        refinement: { sort: { field: "total_spend", direction: "desc" } },
      },
    }),
  ],
  [
    "No, keep my current data",
    () => ({ ...onActive, action: { type: "confirm_switch", accept: false } }),
  ],
  [
    "Why did customer spending decline?",
    () => ({
      relevance: "active_result",
      need: "unsupported",
      action: {
        type: "reply",
        reason: "causal",
        message:
          "I can describe what the data shows, but not explain why it changed. Your current result covers one period, so I can't compare periods either. I can show the lowest spenders, or summarise total spend for this period.",
      },
    }),
  ],
  [
    "Show product sales instead",
    () => ({
      ...newData,
      action: { type: "request_data", capability: "product_sales_performance" },
    }),
  ],
  ["Yes, switch", () => ({ ...onActive, action: { type: "confirm_switch", accept: true } })],
  [
    "Top-selling products",
    () => ({
      ...onActive,
      need: "unclear",
      action: { type: "clarify", question: "Do you mean top-selling by revenue or by units sold?" },
    }),
  ],
  ["By revenue", refine({ sort: { field: "revenue", direction: "desc" } })],
  ["By units sold", refine({ sort: { field: "item_count", direction: "desc" } })],
  [
    "Only the Jeans category",
    refine({ filters: [{ field: "category", op: "in", values: ["Jeans"] }] }),
  ],
  [
    "Revenue by category",
    () => ({
      relevance: "active_result",
      need: "analysis_on_current",
      action: {
        type: "analyze",
        analysis: { operation: "group", group_by: "category", target: "complete" },
      },
    }),
  ],
  ["Clear the filters", refine({ clear_filters: true })],
  [
    "What's the weather today?",
    () => ({
      relevance: "unrelated",
      need: "unsupported",
      action: {
        type: "reply",
        reason: "unrelated",
        message:
          "I can only help with questions about customer spending and product sales in the sample data.",
      },
    }),
  ],
];

export const DEMO_EXAMPLES = SCRIPT.map(([example]) => example);

/** Lower case, single spaces, straight apostrophes, no trailing punctuation. */
export function normalizePhrase(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .toLowerCase();
}

const LOOKUP = new Map(SCRIPT.map(([example, build]) => [normalizePhrase(example), build]));

export class DemoLlmClient extends LlmClient {
  override readonly demoExamples = DEMO_EXAMPLES;

  async decide(context: ModelContext, userText: string): Promise<unknown> {
    const build = LOOKUP.get(normalizePhrase(userText));
    if (build) return build(context.today);
    return {
      relevance: "unrelated",
      need: "unsupported",
      action: { type: "reply", reason: "other", message: ANSWERS.demoUnknown(DEMO_EXAMPLES) },
    };
  }
}
