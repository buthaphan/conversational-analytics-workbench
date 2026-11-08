import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { Clock } from "../../time/clock";
import { ANSWERS, analysisAnswer, switchQuestion, viewAnswer } from "../answers/answers";
import {
  type AllowedValues,
  CAPABILITIES,
  type CapabilityDef,
  type CapabilityId,
  DEFAULT_LIMIT,
  type FieldKind,
  type Issue,
  type Refinement,
  type Scope,
  getCapability,
  validateAnalysis,
  validateRefinement,
  validateScope,
} from "../capabilities/registry";
import { ModelContextBuilder } from "../context/model-context";
import { DataSource, type ResultRowData } from "../data/data-source";
import { type TurnDecision, parseTurnDecision } from "../decision/turn-decision";
import { type AnalysisResult, ResultEngine, type ViewSettings } from "../engine/result-engine";
import { LlmClient } from "../llm/llm-client";

/**
 * Runs one conversation turn (TASK-003 AC-3, AC-4, AC-6, AC-7, AC-11). The model only proposes a
 * TurnDecision; this class compares it with the stored facts and decides what actually happens:
 * execute on the stored rows, clarify, propose a switch, retrieve, or reply. Each turn runs in one
 * transaction holding the analysis session's row lock, so turns for a session are serialized (TD-7)
 * and a switch either fully replaces the active result or changes nothing (TD-6).
 */

export const MESSAGE_LIMIT = 200;
const INSERT_BATCH = 5000;
/** A turn may include a model call and a retrieval; the defaults (5 s) are too short for those. */
const TURN_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };
const SUPPORTED_VIEWS = ["bar", "table"] as const;

export const ORCHESTRATOR_OPTIONS = Symbol("ORCHESTRATOR_OPTIONS");
export interface OrchestratorOptions {
  /** Overrides every capability's row cap (tests and demos). */
  rowCap?: number;
}

export type PendingAction =
  | { type: "switch"; capability: CapabilityId; scope: Scope; refinement?: Refinement }
  | { type: "clarification"; question: string };

type FieldInfo = { name: string; label: string; kind: FieldKind };

/** An analysis result as shown to the user, with its row noun and the labels and kinds of its fields. */
export type AnalysisCard = AnalysisResult & { rowNoun: [string, string]; fields: FieldInfo[] };

export interface ChatMessage {
  seq: number;
  role: "user" | "assistant";
  text: string;
  card?: AnalysisCard;
}

export interface ActiveResultState {
  capability: CapabilityId;
  title: string;
  /** Singular and plural noun for one row, e.g. ["customer", "customers"]. */
  rowNoun: [string, string];
  scope: Scope;
  fields: FieldInfo[];
  rowCount: number;
  filteredCount: number;
  rows: ResultRowData[];
  view: ViewSettings;
}

export interface AnalysisState {
  messages: ChatMessage[];
  activeResult: ActiveResultState | null;
  pending: PendingAction | null;
  /** Backend-written notice shown above the input, e.g. the message limit (review R2). */
  notice: string | null;
}

export interface TurnResult {
  reply: { text: string; card?: AnalysisCard };
  state: AnalysisState;
}

type Tx = Prisma.TransactionClient;

interface SessionFacts {
  id: string;
  messageCount: number;
  view: ViewSettings;
  pending: PendingAction | null;
  active: { id: string; capability: CapabilityId; scope: Scope; rowCount: number } | null;
}

/** What a turn did; `kind` and the counts are what later turns' model context may see. */
interface Outcome {
  text: string;
  kind: string;
  card?: AnalysisCard;
  /** The pending action after this turn; undefined keeps the current one (failures only). */
  pending?: PendingAction | null;
  counts?: { rowCount?: number; filteredCount?: number; shown?: number; baseCount?: number };
}

@Injectable()
export class AnalysisOrchestrator {
  private readonly logger = new Logger(AnalysisOrchestrator.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    private readonly engine: ResultEngine,
    private readonly contextBuilder: ModelContextBuilder,
    private readonly llm: LlmClient,
    private readonly data: DataSource,
    private readonly clock: Clock,
    @Optional() @Inject(ORCHESTRATOR_OPTIONS) private readonly options: OrchestratorOptions = {},
  ) {}

  async getState(authSessionId: string, userId: string): Promise<AnalysisState> {
    return this.prisma.$transaction(async (tx) =>
      this.state(tx, await this.loadFacts(tx, authSessionId, userId, false)),
    );
  }

  /** A chat message: the model proposes, the backend enforces. */
  async handleMessage(authSessionId: string, userId: string, text: string): Promise<TurnResult> {
    return this.turn(authSessionId, userId, text, async (tx, facts) => {
      const decision = await this.decide(tx, facts, text);
      if (!decision)
        return { outcome: { text: ANSWERS.invalidDecision, kind: "invalid_decision" } };
      return { decision, outcome: await this.apply(tx, facts, decision) };
    });
  }

  /** The Switch / Keep current buttons (AC-7). */
  async handleSwitch(
    authSessionId: string,
    userId: string,
    choice: "switch" | "keep",
  ): Promise<TurnResult> {
    const label = choice === "switch" ? "Switch" : "Keep current";
    return this.turn(authSessionId, userId, label, async (tx, facts) => {
      const decision: TurnDecision = {
        relevance: "active_result",
        need: "answerable_now",
        action: { type: "confirm_switch", accept: choice === "switch" },
      };
      return { decision, outcome: await this.apply(tx, facts, decision) };
    });
  }

  // ---- Turn plumbing -----------------------------------------------------------------------------

  private async turn(
    authSessionId: string,
    userId: string,
    userText: string,
    run: (tx: Tx, facts: SessionFacts) => Promise<{ decision?: TurnDecision; outcome: Outcome }>,
  ): Promise<TurnResult> {
    return this.prisma.$transaction(async (tx) => {
      const facts = await this.loadFacts(tx, authSessionId, userId, true);
      if (facts.messageCount + 2 > MESSAGE_LIMIT) {
        return { reply: { text: ANSWERS.messageLimit }, state: await this.state(tx, facts) };
      }
      await this.addMessage(tx, facts, "user", userText);
      const { decision, outcome } = await run(tx, facts);
      if (outcome.pending !== undefined) {
        await tx.analysisSession.update({
          where: { id: facts.id },
          data: {
            pendingAction: outcome.pending
              ? (outcome.pending as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
        });
        facts.pending = outcome.pending;
      }
      const { kind, counts, card } = outcome;
      await this.addMessage(tx, facts, "assistant", outcome.text, {
        ...(decision ? { decision } : {}),
        outcome: {
          kind,
          ...counts,
          ...(facts.active ? { capability: facts.active.capability } : {}),
        },
        ...(card ? { card } : {}),
      });
      return {
        reply: { text: outcome.text, ...(card ? { card } : {}) },
        state: await this.state(tx, facts),
      };
    }, TURN_TRANSACTION);
  }

  /** Finds (or creates) the session's analysis session; `lock` holds its row until the turn ends. */
  private async loadFacts(
    tx: Tx,
    authSessionId: string,
    userId: string,
    lock: boolean,
  ): Promise<SessionFacts> {
    await tx.$executeRaw`
      INSERT INTO analysis_sessions (id, auth_session_id, user_id, updated_at)
      VALUES (gen_random_uuid(), ${authSessionId}::uuid, ${userId}::uuid, now())
      ON CONFLICT (auth_session_id) DO NOTHING`;
    if (lock)
      await tx.$queryRaw`SELECT id FROM analysis_sessions WHERE auth_session_id = ${authSessionId}::uuid FOR UPDATE`;
    const session = await tx.analysisSession.findUniqueOrThrow({
      where: { authSessionId },
      include: {
        activeResultSet: { select: { id: true, capability: true, scope: true, rowCount: true } },
      },
    });
    if (session.userId !== userId)
      throw new Error("Analysis session does not belong to this user.");
    const active = session.activeResultSet;
    return {
      id: session.id,
      messageCount: session.messageCount,
      view: session.viewSettings as unknown as ViewSettings,
      pending: (session.pendingAction as unknown as PendingAction | null) ?? null,
      active: active
        ? {
            id: active.id,
            capability: active.capability as CapabilityId,
            scope: active.scope as unknown as Scope,
            rowCount: active.rowCount,
          }
        : null,
    };
  }

  private async addMessage(
    tx: Tx,
    facts: SessionFacts,
    role: "user" | "assistant",
    text: string,
    payload?: object,
  ) {
    facts.messageCount += 1;
    await tx.analysisMessage.create({
      data: {
        analysisSessionId: facts.id,
        seq: facts.messageCount,
        role,
        text,
        ...(payload ? { payload: payload as Prisma.InputJsonValue } : {}),
      },
    });
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { messageCount: facts.messageCount },
    });
  }

  /** Asks the model; any failure or invalid output is reported by type only, never by content (AC-3). */
  private async decide(tx: Tx, facts: SessionFacts, text: string): Promise<TurnDecision | null> {
    let raw: unknown;
    try {
      raw = await this.llm.decide(
        await this.contextBuilder.build(facts.id, this.clock.now(), tx),
        text,
      );
    } catch (error) {
      this.logger.error(`Model call failed (${(error as Error).name}).`);
      return null;
    }
    const parsed = parseTurnDecision(raw);
    if (!parsed.ok) {
      this.logger.warn(`Model decision rejected (${parsed.error}).`);
      return null;
    }
    return parsed.decision;
  }

  private async state(tx: Tx, facts: SessionFacts): Promise<AnalysisState> {
    const messages = await tx.analysisMessage.findMany({
      where: { analysisSessionId: facts.id },
      orderBy: { seq: "asc" },
      select: { seq: true, role: true, text: true, payload: true },
    });
    let activeResult: ActiveResultState | null = null;
    if (facts.active) {
      const capability = CAPABILITIES[facts.active.capability];
      const view = await this.engine.view(facts.active.id, capability.id, facts.view, tx);
      activeResult = {
        capability: capability.id,
        title: capability.title,
        rowNoun: capability.rowNoun,
        scope: facts.active.scope,
        fields: fieldInfo(capability),
        rowCount: view.rowCount,
        filteredCount: view.filteredCount,
        rows: view.rows,
        view: facts.view,
      };
    }
    return {
      messages: messages.map((m) => {
        const card = (m.payload as { card?: AnalysisCard } | null)?.card;
        return {
          seq: m.seq,
          role: m.role as ChatMessage["role"],
          text: m.text,
          ...(card ? { card } : {}),
        };
      }),
      activeResult,
      pending: facts.pending,
      notice: facts.messageCount + 2 > MESSAGE_LIMIT ? ANSWERS.messageLimit : null,
    };
  }

  // ---- Enforcement (AC-6) ------------------------------------------------------------------------

  private async apply(tx: Tx, facts: SessionFacts, decision: TurnDecision): Promise<Outcome> {
    const action = decision.action;
    switch (action.type) {
      case "confirm_switch": {
        const pending = facts.pending;
        // Nothing to confirm: change nothing, not even a pending clarification (AC-7, review R4).
        if (pending?.type !== "switch")
          return { text: ANSWERS.noPendingSwitch, kind: "no_pending_switch" };
        if (!action.accept) return { text: ANSWERS.keepCurrent, kind: "kept", pending: null };
        return this.load(tx, facts, pending.capability, pending.scope, pending.refinement);
      }
      case "reply":
        // (e) unrelated, unsupported, or causal: the model's own words, no data access.
        return { text: action.message, kind: `reply_${action.reason}`, pending: null };
      case "clarify":
        return {
          text: action.question,
          kind: "clarify",
          pending: { type: "clarification", question: action.question },
        };
      case "request_data":
        return this.requestData(tx, facts, action.capability, action.scope, action.refinement);
      case "change_view":
      case "refine":
      case "analyze": {
        if (!facts.active) return this.clarify(ANSWERS.noActiveResult);
        if (action.type === "refine") return this.refine(tx, facts, action.refinement);
        if (action.type === "analyze") return this.analyze(tx, facts, action.analysis);
        return this.changeView(tx, facts, action.view);
      }
    }
  }

  private async requestData(
    tx: Tx,
    facts: SessionFacts,
    capabilityId: string,
    requestedScope: Partial<Scope> | undefined,
    refinement: Refinement | undefined,
  ): Promise<Outcome> {
    const capability = getCapability(capabilityId);
    if (!capability) {
      const names = Object.values(CAPABILITIES)
        .map((c) => c.title.toLowerCase())
        .join(" or ");
      return {
        text: `That data isn't available. I can answer questions about ${names}.`,
        kind: "reply_unsupported",
        pending: null,
      };
    }

    // A request without a scope inherits the active one; with nothing to inherit, ask first (d).
    let scope: Scope;
    if (!requestedScope?.start_date && !requestedScope?.end_date) {
      if (!facts.active)
        return this.clarify("Which period should I use? Please give a start and end date.");
      scope = facts.active.scope;
    } else {
      const checked = validateScope(requestedScope);
      if (!checked.ok) return this.clarify(checked.issue.message);
      scope = checked.scope;
    }

    if (!facts.active) return this.load(tx, facts, capability.id, scope, refinement); // AC-4: first retrieval
    const active = facts.active;
    const sameData =
      active.capability === capability.id &&
      active.scope.start_date === scope.start_date &&
      active.scope.end_date === scope.end_date;
    if (sameData) return this.refine(tx, facts, refinement ?? {}); // (a) and (f): the facts say no new data is needed

    // (c) different capability or scope: propose, store, do not retrieve.
    const pending: PendingAction = {
      type: "switch",
      capability: capability.id,
      scope,
      ...(refinement ? { refinement } : {}),
    };
    return {
      text: switchQuestion(
        { capability: active.capability, scope: active.scope },
        { capability: capability.id, scope },
      ),
      kind: "switch_proposed",
      pending,
    };
  }

  /** Retrieves and stores a complete result, replacing the active one (AC-4, AC-7, AC-11). */
  private async load(
    tx: Tx,
    facts: SessionFacts,
    capabilityId: CapabilityId,
    scope: Scope,
    refinement: Refinement | undefined,
  ): Promise<Outcome> {
    const capability = CAPABILITIES[capabilityId];
    let rows: ResultRowData[];
    try {
      rows = await this.data.fetch(capabilityId, scope);
    } catch (error) {
      // The old result and any pending switch stay as they were.
      this.logger.error(`Data retrieval failed (${(error as Error).name}).`);
      return { text: ANSWERS.retrievalFailed, kind: "retrieval_failed" };
    }
    const cap = this.options.rowCap ?? capability.rowCap;
    if (rows.length > cap)
      return {
        text: ANSWERS.rowCap(capabilityId, rows.length, cap),
        kind: "row_cap",
        pending: null,
      };

    const resultSet = await tx.resultSet.create({
      data: {
        analysisSessionId: facts.id,
        capability: capabilityId,
        scope: { ...scope },
        rowCount: rows.length,
      },
    });
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH) {
      await tx.resultRow.createMany({
        data: rows
          .slice(offset, offset + INSERT_BATCH)
          .map((data, i) => ({ resultSetId: resultSet.id, rowIndex: offset + i, data })),
      });
    }

    const defaults: ViewSettings = {
      filters: [],
      sort: { ...capability.defaultSort },
      limit: DEFAULT_LIMIT,
      view: "bar",
    };
    const checked = refinement
      ? validateRefinement(capabilityId, refinement, allowedFromRows(capability, rows))
      : null;
    const view = checked?.ok && refinement ? applyRefinement(defaults, refinement) : defaults;

    const previous = facts.active?.id;
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: {
        activeResultSetId: resultSet.id,
        viewSettings: view as unknown as Prisma.InputJsonValue,
      },
    });
    if (previous) await tx.resultSet.delete({ where: { id: previous } });
    facts.active = { id: resultSet.id, capability: capabilityId, scope, rowCount: rows.length };
    facts.view = view;

    const result = await this.engine.view(resultSet.id, capabilityId, view, tx);
    let text = viewAnswer(capabilityId, scope, result, view);
    if (checked && !checked.ok) text += ` ${clarifyText(capability, checked.issue)}`;
    return {
      text,
      kind: "retrieved",
      pending: null,
      counts: {
        rowCount: result.rowCount,
        filteredCount: result.filteredCount,
        shown: result.rows.length,
      },
    };
  }

  private async refine(tx: Tx, facts: SessionFacts, refinement: Refinement): Promise<Outcome> {
    const active = facts.active as NonNullable<SessionFacts["active"]>;
    const capability = CAPABILITIES[active.capability];
    const allowed = await this.engine.allowedValues(active.id, active.capability, tx);
    const checked = validateRefinement(active.capability, refinement, allowed);
    if (!checked.ok) return this.clarify(clarifyText(capability, checked.issue));

    const view = applyRefinement(facts.view, refinement);
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { viewSettings: view as unknown as Prisma.InputJsonValue },
    });
    facts.view = view;
    const result = await this.engine.view(active.id, active.capability, view, tx);
    return {
      text: viewAnswer(active.capability, active.scope, result, view),
      kind: "refined",
      pending: null,
      counts: {
        rowCount: result.rowCount,
        filteredCount: result.filteredCount,
        shown: result.rows.length,
      },
    };
  }

  private async analyze(
    tx: Tx,
    facts: SessionFacts,
    analysis: Extract<TurnDecision["action"], { type: "analyze" }>["analysis"],
  ): Promise<Outcome> {
    const active = facts.active as NonNullable<SessionFacts["active"]>;
    const checked = validateAnalysis(active.capability, analysis);
    if (!checked.ok)
      return this.clarify(clarifyText(CAPABILITIES[active.capability], checked.issue));
    const result = await this.engine.analyze(
      active.id,
      active.capability,
      facts.view,
      checked.analysis,
      tx,
    );
    const capability = CAPABILITIES[active.capability];
    const card: AnalysisCard = {
      ...result,
      rowNoun: capability.rowNoun,
      fields: fieldInfo(capability),
    };
    return {
      text: analysisAnswer(active.capability, active.scope, result),
      kind: "analysis",
      card,
      pending: null,
      counts: { baseCount: card.baseCount },
    };
  }

  private async changeView(tx: Tx, facts: SessionFacts, requested: string): Promise<Outcome> {
    const name = requested
      .trim()
      .toLowerCase()
      .replace(/[\s_-]*chart$/, "");
    const view = SUPPORTED_VIEWS.find((v) => v === name);
    if (!view)
      return {
        text: ANSWERS.viewUnsupported(name || requested),
        kind: "view_unsupported",
        pending: null,
      };
    facts.view = { ...facts.view, view };
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { viewSettings: facts.view as unknown as Prisma.InputJsonValue },
    });
    return { text: ANSWERS.viewChanged(view), kind: "view_changed", pending: null };
  }

  private clarify(question: string): Outcome {
    return { text: question, kind: "clarify", pending: { type: "clarification", question } };
  }
}

const fieldInfo = (capability: CapabilityDef): FieldInfo[] =>
  capability.fields.map(({ name, label, kind }) => ({ name, label, kind }));

/** New filters replace earlier ones on the same field; other settings change only when given. */
export function applyRefinement(view: ViewSettings, refinement: Refinement): ViewSettings {
  let filters = refinement.clear_filters ? [] : view.filters;
  for (const filter of refinement.filters ?? []) {
    filters = [...filters.filter((f) => f.field !== filter.field), filter];
  }
  return {
    ...view,
    filters,
    sort: refinement.sort ? { ...refinement.sort } : view.sort,
    limit: refinement.limit ?? view.limit,
  };
}

function allowedFromRows(capability: CapabilityDef, rows: ResultRowData[]): AllowedValues {
  const allowed: AllowedValues = {};
  for (const field of capability.fields.filter((f) => f.kind === "category")) {
    allowed[field.name] = [...new Set(rows.map((r) => String(r[field.name])))].sort();
  }
  return allowed;
}

/** A validation issue as a question, listing the valid options (AC-6 b). */
function clarifyText(capability: CapabilityDef, issue: Issue): string {
  const options =
    issue.validOptions ??
    (issue.code === "unknown_field"
      ? capability.fields.map((f) => f.label.toLowerCase())
      : undefined);
  return options?.length ? `${issue.message} Options: ${options.join(", ")}.` : issue.message;
}
