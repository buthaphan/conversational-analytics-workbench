import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  type AllowedValues,
  CAPABILITIES,
  type CapabilityId,
  type FieldKind,
  type Scope,
  getCapability,
} from "../capabilities/registry";
import { ResultEngine, type ViewSettings } from "../engine/result-engine";

/**
 * Builds the only context the AI receives (TASK-003 AC-5, TD-9, decision C): catalogue metadata, the
 * active result's summary, allowed categorical values, recent turns as user text plus structured
 * decision/outcome records, today's date, and any pending action. Data rows, names, IDs, and computed
 * figures are never included: assistant message text and result cards are not read at all.
 */

export interface ModelContext {
  today: string;
  catalogue: {
    id: CapabilityId;
    title: string;
    description: string;
    whenToUse: string;
    clarifyWhen: string;
    scope: string;
    fields: { name: string; kind: FieldKind; description: string }[];
    analyses: { summary: string[]; concentration: string[]; groupBy: string[] };
  }[];
  activeResult: null | {
    capability: CapabilityId;
    scope: Scope;
    rowCount: number;
    fields: string[];
    view: ViewSettings;
  };
  allowedValues: AllowedValues;
  recentTurns: (
    { role: "user"; text: string } | { role: "assistant"; decision?: unknown; outcome?: unknown }
  )[];
  pending: unknown;
}

const TURN_WINDOW_MESSAGES = 20; // 10 turns
/** Outcome fields that are counts or kinds, never figures. */
const OUTCOME_KEYS = [
  "kind",
  "rowCount",
  "filteredCount",
  "shown",
  "baseCount",
  "capability",
  "view",
];

const SCOPE_RULE =
  "start_date (inclusive) and end_date (exclusive), YYYY-MM-DD, at most 5 years apart. Changing the scope needs new data.";

/** The fixed catalogue part of the context; exported for the model evaluation (TASK-004 AC-10). */
export function buildCatalogue(): ModelContext["catalogue"] {
  return Object.values(CAPABILITIES).map((c) => {
    const numeric = c.fields
      .filter((f) => f.kind === "money" || f.kind === "integer")
      .map((f) => f.name);
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      whenToUse: c.whenToUse,
      clarifyWhen: c.clarifyWhen,
      scope: SCOPE_RULE,
      fields: c.fields.map(({ name, kind, description }) => ({ name, kind, description })),
      analyses: {
        summary: numeric,
        concentration: c.concentrationMeasures,
        groupBy: c.groupByFields,
      },
    };
  });
}

function pickOutcome(outcome: unknown): unknown {
  if (!outcome || typeof outcome !== "object") return undefined;
  return Object.fromEntries(Object.entries(outcome).filter(([key]) => OUTCOME_KEYS.includes(key)));
}

@Injectable()
export class ModelContextBuilder {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly engine: ResultEngine,
  ) {}

  /**
   * `db` lets a turn build the context inside its own transaction. `latestUserText` is the turn's
   * message when it is not stored yet (the two-phase turn stores it with the outcome, TASK-004 AC-1);
   * it is appended as the last turn.
   */
  async build(
    analysisSessionId: string,
    today: Date,
    db: Prisma.TransactionClient = this.prisma,
    latestUserText?: string,
  ): Promise<ModelContext> {
    const session = await db.analysisSession.findUniqueOrThrow({
      where: { id: analysisSessionId },
      select: {
        viewSettings: true,
        pendingAction: true,
        // Metadata only: the rows relation is deliberately not selected.
        activeResultSet: { select: { id: true, capability: true, scope: true, rowCount: true } },
      },
    });
    const messages = await db.analysisMessage.findMany({
      where: { analysisSessionId },
      orderBy: { seq: "desc" },
      take: latestUserText === undefined ? TURN_WINDOW_MESSAGES : TURN_WINDOW_MESSAGES - 1,
      select: { role: true, text: true, payload: true },
    });

    const active = session.activeResultSet;
    const capability = active ? getCapability(active.capability) : undefined;

    return {
      today: today.toISOString().slice(0, 10),
      catalogue: buildCatalogue(),
      activeResult:
        active && capability
          ? {
              capability: capability.id,
              scope: active.scope as unknown as Scope,
              rowCount: active.rowCount,
              fields: capability.fields.map((f) => f.name),
              view: session.viewSettings as unknown as ViewSettings,
            }
          : null,
      allowedValues:
        active && capability ? await this.engine.allowedValues(active.id, capability.id, db) : {},
      recentTurns: [
        ...messages.reverse().map((m) => {
          if (m.role === "user") return { role: "user" as const, text: m.text };
          const payload = (m.payload ?? {}) as { decision?: unknown; outcome?: unknown };
          return {
            role: "assistant" as const,
            decision: payload.decision,
            outcome: pickOutcome(payload.outcome),
          };
        }),
        ...(latestUserText === undefined ? [] : [{ role: "user" as const, text: latestUserText }]),
      ],
      pending: session.pendingAction ?? null,
    };
  }
}
