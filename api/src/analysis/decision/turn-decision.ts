import { z } from "zod";

/**
 * The AI's single structured decision per turn (TASK-003 TD-1, AC-3). It is untrusted input: this
 * schema checks its shape; the capability registry and orchestrator check its meaning.
 */

const filter = z
  .object({
    field: z.string().min(1).max(64),
    op: z.enum(["gt", "gte", "lt", "lte", "between", "in"]),
    value: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.string().max(100)).max(50).optional(),
  })
  .strict();

const refinement = z
  .object({
    filters: z.array(filter).max(10).optional(),
    sort: z
      .object({ field: z.string().min(1).max(64), direction: z.enum(["asc", "desc"]) })
      .strict()
      .optional(),
    limit: z.number().int().optional(),
    clear_filters: z.boolean().optional(),
    // TASK-005 (DEC-002): view settings. The registry checks which capability allows each.
    group_by: z.enum(["category", "department", "brand", "none"]).optional(),
    interval: z.enum(["day", "week", "month"]).optional(),
    // An enum, so structured output cannot produce a malformed value (walkthrough W2).
    measure: z.enum(["revenue", "order_count", "item_count"]).optional(),
  })
  .strict();

const scope = z
  .object({ start_date: z.string().max(10).optional(), end_date: z.string().max(10).optional() })
  .strict();

/**
 * Retrieval parameters of `sales_time_series` (TASK-005 AC-3). The comparison is a union so that
 * custom dates are required where they apply: the structured-output schema allows at most 24
 * optional properties (TASK-004), and optional dates would exceed it.
 */
const isoDate = z.string().max(10);
const parameters = z
  .object({
    product_filter: z
      .object({
        field: z.enum(["category", "department"]),
        values: z.array(z.string().min(1).max(100)).min(1).max(10),
      })
      .strict()
      .optional(),
    comparison: z
      .discriminatedUnion("baseline", [
        z.object({ baseline: z.literal("previous_period") }).strict(),
        z.object({ baseline: z.literal("previous_year") }).strict(),
        z
          .object({ baseline: z.literal("custom"), start_date: isoDate, end_date: isoDate })
          .strict(),
      ])
      .optional(),
  })
  .strict();

const analysis = z
  .object({
    // TASK-005 AC-8: grouping is the refinement's group_by (a view), so there is no group analysis.
    operation: z.enum(["summary", "concentration"]),
    field: z.string().max(64).optional(),
    measure: z.string().max(64).optional(),
    top_count: z.number().optional(),
    top_percent: z.number().optional(),
    target: z.enum(["complete", "filtered", "displayed"]).default("complete"),
  })
  .strict()
  .refine(
    (a) =>
      a.operation !== "concentration" ||
      (a.top_count === undefined) !== (a.top_percent === undefined),
    { message: "Concentration needs exactly one of top_count or top_percent." },
  );

const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("refine"), refinement }).strict(),
  z.object({ type: z.literal("analyze"), analysis }).strict(),
  z.object({ type: z.literal("change_view"), view: z.string().min(1).max(32) }).strict(),
  z
    .object({
      type: z.literal("request_data"),
      capability: z.string().min(1).max(64),
      scope: scope.optional(),
      parameters: parameters.optional(),
      refinement: refinement.optional(),
    })
    .strict(),
  z.object({ type: z.literal("confirm_switch"), accept: z.boolean() }).strict(),
  z.object({ type: z.literal("clarify"), question: z.string().min(1).max(500) }).strict(),
  z
    .object({
      type: z.literal("reply"),
      message: z.string().min(1).max(1000),
      reason: z.enum(["unrelated", "unsupported", "causal", "other"]),
    })
    .strict(),
]);

export const turnDecisionSchema = z
  .object({
    relevance: z.enum(["active_result", "other_capability", "unrelated"]),
    need: z.enum(["answerable_now", "analysis_on_current", "new_data", "unclear", "unsupported"]),
    action,
  })
  .strict();

export type TurnDecision = z.infer<typeof turnDecisionSchema>;
export type DecisionAction = TurnDecision["action"];

/**
 * JSON Schema for the model's structured output (used by the Claude adapter, TASK-004). Reused parts
 * (refinement, filter) are shared definitions, so the API's limit on optional parameters counts them
 * once.
 */
export const TURN_DECISION_JSON_SCHEMA = z.toJSONSchema(turnDecisionSchema, {
  io: "input",
  reused: "ref",
});

export type ParsedDecision = { ok: true; decision: TurnDecision } | { ok: false; error: string };

/** Parses raw model output (JSON text or an object). Never throws. */
export function parseTurnDecision(raw: unknown): ParsedDecision {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
  }
  const result = turnDecisionSchema.safeParse(value);
  return result.success
    ? { ok: true, decision: result.data }
    : { ok: false, error: "schema_violation" };
}
