import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { Clock } from "../../time/clock";
import {
  ANSWERS,
  INTERVAL_NOUNS,
  analysisAnswer,
  groupedAnswer,
  pieAnswer,
  viewUnsuitableReason,
  seriesAnswer,
  switchQuestion,
  viewAnswer,
} from "../answers/answers";
import {
  type AllowedValues,
  CAPABILITIES,
  type CapabilityDef,
  type CapabilityId,
  DEFAULT_BRAND_GROUPS,
  DEFAULT_LIMIT,
  DEFAULT_VIEW,
  type FieldKind,
  type Issue,
  type Refinement,
  type RequestParameters,
  type ResultShape,
  SALES_TIME_SERIES,
  type Scope,
  type TimeSeriesMeasure,
  VIEWS_BY_SHAPE,
  type ViewContext,
  seriesDefaultInterval,
  normalizeViewName,
  getCapability,
  sameParameters,
  validateAnalysis,
  validateRefinement,
  validateRequestParameters,
  validateScope,
} from "../capabilities/registry";
import { type ModelContext, ModelContextBuilder } from "../context/model-context";
import { DataSource, type ResultRowData } from "../data/data-source";
import { seriesPeriods } from "../data/time-series";
import { type TurnDecision, parseTurnDecision } from "../decision/turn-decision";
import {
  type AnalysisResult,
  type Db,
  type GroupedView,
  ResultEngine,
  type SeriesView,
  type ViewSettings,
  summarizeSeries,
} from "../engine/result-engine";
import { LlmClient } from "../llm/llm-client";

/**
 * Runs one conversation turn (TASK-003 AC-3, AC-4, AC-6, AC-7, AC-11). The model only proposes a
 * TurnDecision; this class compares it with the stored facts and decides what actually happens:
 * execute on the stored rows, clarify, propose a switch, retrieve, or reply.
 *
 * A turn has three phases (TASK-004 AC-1, DEC-001), so no lock is held while the model or the data
 * source works and a session end never waits on a slow turn:
 * - A, claim (short, locked): check the message limit, write a turn marker, snapshot the facts and
 *   build the model context. A live marker refuses the turn (`TurnInProgressError`), so turns for a
 *   session still run one at a time (TD-7) and the snapshot stays valid until phase C.
 * - B (no transaction): the model call, decision validation, and any retrieval.
 * - C, save (short, locked): only if the session still exists and still carries this turn's marker,
 *   write both messages and the outcome and clear the marker; a switch either fully replaces the
 *   active result or changes nothing (TD-6). Otherwise the outcome is discarded.
 */

export const MESSAGE_LIMIT = 200;
/**
 * A marker older than this belongs to a crashed turn and may be taken over. It exceeds the model
 * timeout with one retry plus the query timeout (2 × 30 s + 30 s).
 */
export const TURN_DEADLINE_MS = 120_000;
const INSERT_BATCH = 5000;
/** Saving a large result may take longer than the 5 s default. */
const SAVE_TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

/** Another turn for this session is still being answered (HTTP 409 `turn_in_progress`). */
export class TurnInProgressError extends Error {
  constructor() {
    super("Another turn is in progress for this analysis session.");
    this.name = "TurnInProgressError";
  }
}

/**
 * This turn outlived the deadline and a newer turn took over, so its outcome was discarded
 * (HTTP 409 `turn_superseded`, review S4).
 */
export class TurnSupersededError extends Error {
  constructor() {
    super("The turn took too long and was replaced by a newer one.");
    this.name = "TurnSupersededError";
  }
}

/**
 * This turn finished after the deadline: the session already reports it as over, so its outcome is
 * discarded and its own marker cleared (HTTP 409 `turn_superseded`, review round 2).
 */
export class TurnExpiredError extends TurnSupersededError {
  constructor() {
    super();
    this.name = "TurnExpiredError";
  }
}

/** The login session ended before or during the turn (HTTP 401); nothing is written. */
export class SessionEndedError extends Error {
  constructor() {
    super("The session ended during the turn.");
    this.name = "SessionEndedError";
  }
}

export const ORCHESTRATOR_OPTIONS = Symbol("ORCHESTRATOR_OPTIONS");
export interface OrchestratorOptions {
  /** Lowers every capability's row cap (tests); it can never raise the registry value. */
  rowCap?: number;
}

export type PendingAction =
  | {
      type: "switch";
      capability: CapabilityId;
      scope: Scope;
      /** Time series only (TASK-005 AC-6). */
      parameters?: RequestParameters;
      refinement?: Refinement;
    }
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
  /** Displayed entity rows; empty for a time series, which is shown as `series`. */
  rows: ResultRowData[];
  view: ViewSettings;
  /** Time series only (TASK-005 AC-5, AC-6): its retrieval parameters and its buckets. */
  parameters?: RequestParameters;
  series?: SeriesView;
  /** The comparison period's dates, computed by the backend for display (TASK-005 AC-11). */
  comparisonScope?: Scope;
  /** A grouped product result's groups, shown as the main view (TASK-005 AC-8). */
  grouped?: GroupedView;
}

export interface AnalysisState {
  messages: ChatMessage[];
  activeResult: ActiveResultState | null;
  pending: PendingAction | null;
  /** Backend-written notice shown above the input, e.g. the message limit (review R2). */
  notice: string | null;
  /** A turn is being answered right now, e.g. when the page was refreshed mid-turn (TASK-004 AC-2). */
  turnInProgress: boolean;
}

export interface TurnResult {
  reply: { text: string; card?: AnalysisCard };
  state: AnalysisState;
}

type Tx = Prisma.TransactionClient;

interface ActiveFacts {
  id: string;
  capability: CapabilityId;
  scope: Scope;
  rowCount: number;
  /** Time series only; `{}` when it has no filter or comparison. */
  parameters?: RequestParameters;
  /** Time series only: the UTC date of the retrieval (cut-off and partial bucket, S7). */
  asOf?: string;
}

interface SessionFacts {
  id: string;
  messageCount: number;
  view: ViewSettings;
  pending: PendingAction | null;
  active: ActiveFacts | null;
  turn: { id: string; startedAt: Date } | null;
}

/** A retrieval done in phase B, handed to phase C; `asOf` is the date a time series was cut at. */
type Fetched = { ok: true; rows: ResultRowData[]; asOf?: string } | { ok: false };

type SwitchAction = Extract<PendingAction, { type: "switch" }>;
/** What to retrieve (and, on a switch, what to load). */
type Retrieval = Omit<SwitchAction, "type">;

/** What a data request means given the facts; shared by phases B and C so they always agree. */
type RequestPlan =
  | { kind: "unsupported" }
  | { kind: "clarify"; question: string }
  | ({ kind: "load" } & Retrieval)
  | { kind: "same_data"; refinement: Refinement }
  | { kind: "propose"; pending: SwitchAction };

/** What a turn did; `kind` and the counts are what later turns' model context may see. */
interface Outcome {
  text: string;
  kind: string;
  card?: AnalysisCard;
  /**
   * The pending action after this turn. Undefined keeps the current one: used for failures and for
   * a confirmation with nothing to confirm (AC-7).
   */
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
    return this.prisma.$transaction(async (tx) => {
      await this.ensureSession(tx, authSessionId, userId);
      return this.state(tx, await this.readFacts(tx, authSessionId, userId));
    });
  }

  /** A chat message: the model proposes, the backend enforces. */
  async handleMessage(authSessionId: string, userId: string, text: string): Promise<TurnResult> {
    return this.turn(authSessionId, userId, text, (context) =>
      this.decide(context as ModelContext, text),
    );
  }

  /** The Switch / Keep current buttons (AC-7). */
  async handleSwitch(
    authSessionId: string,
    userId: string,
    choice: "switch" | "keep",
  ): Promise<TurnResult> {
    const label = choice === "switch" ? "Switch" : "Keep current";
    const decision: TurnDecision = {
      relevance: "active_result",
      need: "answerable_now",
      action: { type: "confirm_switch", accept: choice === "switch" },
    };
    return this.turn(authSessionId, userId, label, async () => decision, false);
  }

  // ---- Turn plumbing -----------------------------------------------------------------------------

  /**
   * `decide` runs in phase B and returns the validated decision, or null for a model failure or an
   * invalid decision. It receives the model context when `withContext` is true.
   */
  private async turn(
    authSessionId: string,
    userId: string,
    userText: string,
    decide: (context: ModelContext | null) => Promise<TurnDecision | null>,
    withContext = true,
  ): Promise<TurnResult> {
    // Phase A: claim the turn.
    type Claim =
      | { limited: AnalysisState }
      | { facts: SessionFacts; turnId: string; context: ModelContext | null };
    const claim = await this.prisma.$transaction(async (tx): Promise<Claim> => {
      await this.ensureSession(tx, authSessionId, userId);
      const facts = await this.readFacts(tx, authSessionId, userId, true);
      if (facts.messageCount + 2 > MESSAGE_LIMIT) return { limited: await this.state(tx, facts) };
      const now = this.clock.now();
      if (facts.turn && !this.isStale(facts.turn)) throw new TurnInProgressError();
      const turnId = randomUUID();
      await tx.analysisSession.update({
        where: { id: facts.id },
        data: { turnId, turnStartedAt: now },
      });
      const context = withContext
        ? await this.contextBuilder.build(facts.id, now, tx, userText)
        : null;
      return { facts, turnId, context };
    });
    if ("limited" in claim) return { reply: { text: ANSWERS.messageLimit }, state: claim.limited };

    try {
      // Phase B: no transaction, no lock.
      const decision = await decide(claim.context);
      const retrieval = decision ? retrievalFor(claim.facts, decision) : null;
      const fetched = retrieval ? await this.fetch(retrieval) : undefined;

      // Phase C: save, if the session and this turn's claim still exist.
      return await this.prisma.$transaction(
        (tx) => this.save(tx, authSessionId, userId, claim.turnId, userText, decision, fetched),
        SAVE_TRANSACTION,
      );
    } catch (error) {
      // Not ours to release: the session is gone, or a newer turn owns the marker. An expired turn
      // still owns its (stale) marker and clears it.
      const notOurs =
        error instanceof SessionEndedError ||
        (error instanceof TurnSupersededError && !(error instanceof TurnExpiredError));
      if (!notOurs) await this.release(claim.facts.id, claim.turnId);
      throw error;
    }
  }

  private async save(
    tx: Tx,
    authSessionId: string,
    userId: string,
    turnId: string,
    userText: string,
    decision: TurnDecision | null,
    fetched: Fetched | undefined,
  ): Promise<TurnResult> {
    const facts = await this.readFacts(tx, authSessionId, userId, true);
    if (facts.turn?.id !== turnId) throw new TurnSupersededError(); // taken over after the deadline
    // Past the deadline the session already reports the turn as over, so it must not save now.
    if (this.isStale(facts.turn)) throw new TurnExpiredError();
    await this.addMessage(tx, facts, "user", userText);
    const outcome: Outcome = decision
      ? await this.apply(tx, facts, decision, fetched)
      : { text: ANSWERS.invalidDecision, kind: "invalid_decision" };
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
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { turnId: null, turnStartedAt: null },
    });
    facts.turn = null;
    return {
      reply: { text: outcome.text, ...(card ? { card } : {}) },
      state: await this.state(tx, facts),
    };
  }

  /** Clears this turn's marker after an unexpected failure, so the session is free again. */
  private async release(analysisSessionId: string, turnId: string): Promise<void> {
    try {
      await this.prisma.analysisSession.updateMany({
        where: { id: analysisSessionId, turnId },
        data: { turnId: null, turnStartedAt: null },
      });
    } catch (error) {
      // The marker expires at the deadline anyway.
      this.logger.error(`Could not release the turn (${(error as Error).name}).`);
    }
  }

  private isStale(turn: { startedAt: Date }): boolean {
    return this.clock.now().getTime() - turn.startedAt.getTime() >= TURN_DEADLINE_MS;
  }

  /**
   * Creates the analysis session on first use, but only for a login session that has not ended.
   * Never called from phase C, so a late turn cannot recreate deleted analysis data.
   */
  private async ensureSession(tx: Tx, authSessionId: string, userId: string): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO analysis_sessions (id, auth_session_id, user_id, updated_at)
      SELECT gen_random_uuid(), s.id, ${userId}::uuid, now()
      FROM auth_sessions s
      WHERE s.id = ${authSessionId}::uuid AND s.ended_at IS NULL
      ON CONFLICT (auth_session_id) DO NOTHING`;
  }

  /**
   * Reads the analysis session of a login session that has not ended; `lock` holds its row until
   * the transaction ends (phases A and C only, both short). Throws SessionEndedError otherwise.
   */
  private async readFacts(
    tx: Tx,
    authSessionId: string,
    userId: string,
    lock = false,
  ): Promise<SessionFacts> {
    const live = lock
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT a.id FROM analysis_sessions a
          JOIN auth_sessions s ON s.id = a.auth_session_id
          WHERE a.auth_session_id = ${authSessionId}::uuid AND s.ended_at IS NULL
          FOR UPDATE OF a`
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT a.id FROM analysis_sessions a
          JOIN auth_sessions s ON s.id = a.auth_session_id
          WHERE a.auth_session_id = ${authSessionId}::uuid AND s.ended_at IS NULL`;
    if (live.length === 0) throw new SessionEndedError();
    const session = await tx.analysisSession.findUniqueOrThrow({
      where: { authSessionId },
      include: {
        activeResultSet: {
          select: {
            id: true,
            capability: true,
            scope: true,
            rowCount: true,
            parameters: true,
            asOf: true,
          },
        },
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
            ...(active.parameters !== null
              ? { parameters: active.parameters as unknown as RequestParameters }
              : {}),
            ...(active.asOf ? { asOf: active.asOf.toISOString().slice(0, 10) } : {}),
          }
        : null,
      turn:
        session.turnId && session.turnStartedAt
          ? { id: session.turnId, startedAt: session.turnStartedAt }
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
  private async decide(context: ModelContext, text: string): Promise<TurnDecision | null> {
    let raw: unknown;
    try {
      raw = await this.llm.decide(context, text);
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
      const shared = {
        capability: capability.id,
        title: capability.title,
        rowNoun: capability.rowNoun,
        scope: facts.active.scope,
        fields: fieldInfo(capability),
        view: facts.view,
      };
      if (capability.id === SALES_TIME_SERIES) {
        const parameters = facts.active.parameters ?? {};
        const comparison = seriesPeriods(facts.active.scope, parameters).find(
          (p) => p.period === "comparison",
        );
        activeResult = {
          ...shared,
          rowCount: facts.active.rowCount,
          filteredCount: facts.active.rowCount,
          rows: [],
          parameters,
          series: await this.seriesView(facts.active, facts.view, tx),
          ...(comparison ? { comparisonScope: comparison.scope } : {}),
        };
      } else {
        const view = await this.engine.view(facts.active.id, capability.id, facts.view, tx);
        activeResult = {
          ...shared,
          rowCount: view.rowCount,
          filteredCount: view.filteredCount,
          rows: view.rows,
          ...(facts.view.group_by
            ? { grouped: await this.engine.groups(facts.active.id, capability.id, facts.view, tx) }
            : {}),
        };
      }
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
      turnInProgress: facts.turn !== null && !this.isStale(facts.turn),
    };
  }

  /** The active time series rolled up by the view's interval and measure (TASK-005 AC-5). */
  private seriesView(active: ActiveFacts, view: ViewSettings, db: Db): Promise<SeriesView> {
    return this.engine.series(
      active.id,
      {
        periods: seriesPeriods(active.scope, active.parameters ?? {}),
        interval: view.interval ?? seriesDefaultInterval(active.scope, active.parameters ?? {}),
        measure: view.measure ?? "revenue",
        today: active.asOf ?? this.today(),
      },
      db,
    );
  }

  /** Today's date in UTC, YYYY-MM-DD. */
  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  /** Phase B retrieval; a failure is reported by type only and keeps the current result (AC-7). */
  private async fetch({ capability, scope, parameters }: Retrieval): Promise<Fetched> {
    try {
      if (capability === SALES_TIME_SERIES) {
        // The cut-off date is stored with the rows, so the partial bucket stays right later.
        const asOf = this.today();
        const rows = await this.data.fetchTimeSeries(scope, parameters ?? {}, asOf);
        return { ok: true, rows, asOf };
      }
      return { ok: true, rows: await this.data.fetch(capability, scope) };
    } catch (error) {
      this.logger.error(`Data retrieval failed (${(error as Error).name}).`);
      return { ok: false };
    }
  }

  // ---- Enforcement (AC-6) ------------------------------------------------------------------------

  /** `fetched` is phase B's retrieval, present exactly when `retrievalFor` asked for one. */
  private async apply(
    tx: Tx,
    facts: SessionFacts,
    decision: TurnDecision,
    fetched: Fetched | undefined,
  ): Promise<Outcome> {
    const action = decision.action;
    switch (action.type) {
      case "confirm_switch": {
        const pending = facts.pending;
        // Nothing to confirm: change nothing, not even a pending clarification (AC-7, review R4).
        if (pending?.type !== "switch")
          return { text: ANSWERS.noPendingSwitch, kind: "no_pending_switch" };
        if (!action.accept) return { text: ANSWERS.keepCurrent, kind: "kept", pending: null };
        return this.load(tx, facts, retrievalOf(pending), fetched);
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
        return this.requestData(tx, facts, planRequest(facts, action), fetched);
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
    plan: RequestPlan,
    fetched: Fetched | undefined,
  ): Promise<Outcome> {
    switch (plan.kind) {
      case "unsupported": {
        const names = Object.values(CAPABILITIES)
          .map((c) => c.title.toLowerCase())
          .join(" or ");
        return {
          text: `That data isn't available. I can answer questions about ${names}.`,
          kind: "reply_unsupported",
          pending: null,
        };
      }
      case "clarify":
        return this.clarify(plan.question);
      case "load": // AC-4: first retrieval
        return this.load(tx, facts, retrievalOf(plan), fetched);
      case "same_data": // (a) and (f): the facts say no new data is needed
        return this.refine(tx, facts, plan.refinement);
      case "propose": {
        // (c) different capability, scope, or time-series parameters: propose, store, do not retrieve.
        const active = facts.active as ActiveFacts;
        return {
          text: switchQuestion(
            {
              capability: active.capability,
              scope: active.scope,
              ...(active.parameters ? { parameters: active.parameters } : {}),
            },
            {
              capability: plan.pending.capability,
              scope: plan.pending.scope,
              ...(plan.pending.parameters ? { parameters: plan.pending.parameters } : {}),
            },
          ),
          kind: "switch_proposed",
          pending: plan.pending,
        };
      }
    }
  }

  /** Stores phase B's complete result, replacing the active one (AC-4, AC-7, AC-11). */
  private async load(
    tx: Tx,
    facts: SessionFacts,
    { capability: capabilityId, scope, parameters, refinement }: Retrieval,
    fetched: Fetched | undefined,
  ): Promise<Outcome> {
    if (!fetched) throw new Error("A retrieval was needed but not done in phase B.");
    const capability = CAPABILITIES[capabilityId];
    const isSeries = capabilityId === SALES_TIME_SERIES;
    // The old result and any pending switch stay as they were.
    if (!fetched.ok) return { text: ANSWERS.retrievalFailed, kind: "retrieval_failed" };
    const rows = fetched.rows;
    // The option (tests) may only lower the registry cap (TASK-004 AC-8, review N2).
    const cap = Math.min(this.options.rowCap ?? Infinity, capability.rowCap);
    if (rows.length > cap)
      return {
        text: ANSWERS.rowCap(capabilityId, rows.length, cap),
        kind: "row_cap",
        pending: null,
      };

    const series = isSeries ? { parameters: parameters ?? {}, asOf: fetched.asOf } : null;
    const resultSet = await tx.resultSet.create({
      data: {
        analysisSessionId: facts.id,
        capability: capabilityId,
        scope: { ...scope },
        rowCount: rows.length,
        ...(series
          ? {
              parameters: series.parameters as unknown as Prisma.InputJsonValue,
              ...(series.asOf ? { asOf: new Date(`${series.asOf}T00:00:00Z`) } : {}),
            }
          : {}),
      },
    });
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH) {
      await tx.resultRow.createMany({
        data: rows
          .slice(offset, offset + INSERT_BATCH)
          .map((data, i) => ({ resultSetId: resultSet.id, rowIndex: offset + i, data })),
      });
    }

    // A time series starts as a line with the default interval and revenue (AC-3, AC-9).
    const defaults: ViewSettings = {
      filters: [],
      sort: { ...capability.defaultSort },
      limit: DEFAULT_LIMIT,
      view: isSeries ? "line" : "bar",
      // The default interval suits the longer period, so a long comparison is never daily (SF-1).
      ...(isSeries
        ? { interval: seriesDefaultInterval(scope, parameters ?? {}), measure: "revenue" as const }
        : {}),
    };
    const checked = refinement
      ? validateRefinement(
          capabilityId,
          refinement,
          allowedFromRows(capability, rows),
          viewContext(defaults),
        )
      : null;
    const view =
      checked?.ok && refinement
        ? fitView(capabilityId, applyRefinement(defaults, refinement))
        : defaults;

    const previous = facts.active?.id;
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: {
        activeResultSetId: resultSet.id,
        viewSettings: view as unknown as Prisma.InputJsonValue,
      },
    });
    if (previous) await tx.resultSet.delete({ where: { id: previous } });
    facts.active = {
      id: resultSet.id,
      capability: capabilityId,
      scope,
      rowCount: rows.length,
      ...(series ? { parameters: series.parameters } : {}),
      ...(series?.asOf ? { asOf: series.asOf } : {}),
    };
    facts.view = view;

    const outcome = await this.viewOutcome(tx, facts.active, view, "retrieved");
    if (checked && !checked.ok) outcome.text += ` ${clarifyText(capability, checked.issue)}`;
    return outcome;
  }

  private async refine(tx: Tx, facts: SessionFacts, refinement: Refinement): Promise<Outcome> {
    const active = facts.active as ActiveFacts;
    const capability = CAPABILITIES[active.capability];
    // A time series' interval and measure are checked against its periods (AC-3, AC-6).
    if (active.capability === SALES_TIME_SERIES) {
      // A refinement without an interval keeps the view's (task review SF-1).
      const series = validateRequestParameters(
        active.capability,
        active.scope,
        active.parameters,
        refinement,
        facts.view.interval,
      );
      if (!series.ok) return this.clarify(clarifyText(capability, series.issue));
    }
    const allowed = await this.engine.allowedValues(active.id, active.capability, tx);
    const checked = validateRefinement(
      active.capability,
      refinement,
      allowed,
      viewContext(facts.view),
    );
    if (!checked.ok) return this.clarify(clarifyText(capability, checked.issue));

    const view = fitView(active.capability, applyRefinement(facts.view, refinement));
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { viewSettings: view as unknown as Prisma.InputJsonValue },
    });
    facts.view = view;
    return this.viewOutcome(tx, active, view, "refined");
  }

  /** The answer and counts for the active result as now viewed. */
  private async viewOutcome(
    tx: Tx,
    active: ActiveFacts,
    view: ViewSettings,
    kind: "retrieved" | "refined",
  ): Promise<Outcome> {
    if (active.capability === SALES_TIME_SERIES) {
      const series = await this.seriesView(active, view, tx);
      return {
        text: seriesAnswer(
          active.scope,
          active.parameters ?? {},
          series,
          active.asOf ?? this.today(),
        ),
        kind,
        pending: null,
        counts: { rowCount: active.rowCount, shown: series.main.length },
      };
    }
    if (view.group_by) {
      const grouped = await this.engine.groups(active.id, active.capability, view, tx);
      return {
        text: groupedAnswer(active.capability, active.scope, grouped, view),
        kind,
        pending: null,
        counts: {
          rowCount: grouped.rowCount,
          filteredCount: grouped.filteredCount,
          shown: grouped.groups.length,
        },
      };
    }
    const result = await this.engine.view(active.id, active.capability, view, tx);
    return {
      text: viewAnswer(active.capability, active.scope, result, view),
      kind,
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
    const active = facts.active as ActiveFacts;
    const capability = CAPABILITIES[active.capability];
    const isSeries = active.capability === SALES_TIME_SERIES;
    // A series' summary defaults to the charted measure (TASK-005 AC-7).
    const requested =
      isSeries && analysis.operation === "summary" && !analysis.field
        ? { ...analysis, field: facts.view.measure ?? "revenue" }
        : analysis;
    const checked = validateAnalysis(active.capability, requested);
    if (!checked.ok) return this.clarify(clarifyText(capability, checked.issue));
    // Analyses run on product rows; the groups on screen are not rows (TASK-005 AC-8).
    if (facts.view.group_by && checked.analysis.target === "displayed")
      return this.clarify(ANSWERS.displayedWhileGrouped);

    let result: AnalysisResult;
    let rowNoun = capability.rowNoun;
    if (isSeries) {
      // Summarized per bucket of the current view, not per stored day.
      const series = await this.seriesView(active, facts.view, tx);
      result = summarizeSeries(series, checked.analysis.field as TimeSeriesMeasure);
      rowNoun = INTERVAL_NOUNS[series.interval];
    } else {
      result = await this.engine.analyze(
        active.id,
        active.capability,
        facts.view,
        checked.analysis,
        tx,
      );
    }
    const card: AnalysisCard = { ...result, rowNoun, fields: fieldInfo(capability) };
    return {
      text: analysisAnswer(active.capability, active.scope, result, active.parameters),
      kind: "analysis",
      card,
      pending: null,
      counts: { baseCount: card.baseCount },
    };
  }

  /** A view change never retrieves; a view that does not suit the result is refused (AC-9). */
  private async changeView(tx: Tx, facts: SessionFacts, requested: string): Promise<Outcome> {
    const active = facts.active as ActiveFacts;
    const shape = shapeOf(active.capability, facts.view);
    const suitable = VIEWS_BY_SHAPE[shape];
    const view = normalizeViewName(requested);
    if (!view)
      return {
        text: ANSWERS.viewUnsupported(requested, suitable),
        kind: "view_unsupported",
        pending: null,
      };
    if (!suitable.includes(view))
      return {
        text: ANSWERS.viewUnsuitable(
          view,
          viewUnsuitableReason(shape, view, active.capability),
          suitable,
        ),
        kind: "view_unsuitable",
        pending: null,
      };
    facts.view = { ...facts.view, view };
    await tx.analysisSession.update({
      where: { id: facts.id },
      data: { viewSettings: facts.view as unknown as Prisma.InputJsonValue },
    });
    const text =
      view === "pie"
        ? pieAnswer(
            active.capability,
            await this.engine.groups(active.id, active.capability, facts.view, tx),
          )
        : ANSWERS.viewChanged(view);
    return { text, kind: "view_changed", pending: null };
  }

  private clarify(question: string): Outcome {
    return { text: question, kind: "clarify", pending: { type: "clarification", question } };
  }
}

/** The shape of the active result as viewed: a series, groups, or entity rows (AC-9). */
const shapeOf = (capability: CapabilityId, view: ViewSettings): ResultShape =>
  capability === SALES_TIME_SERIES ? "series" : view.group_by ? "groups" : "rows";

/** Keeps the view if it suits the shape; otherwise the shape's default (e.g. pie after ungrouping). */
function fitView(capability: CapabilityId, view: ViewSettings): ViewSettings {
  const shape = shapeOf(capability, view);
  return VIEWS_BY_SHAPE[shape].includes(view.view) ? view : { ...view, view: DEFAULT_VIEW[shape] };
}

const fieldInfo = (capability: CapabilityDef): FieldInfo[] =>
  capability.fields.map(({ name, label, kind }) => ({ name, label, kind }));

type RequestDataAction = Extract<TurnDecision["action"], { type: "request_data" }>;

/** The retrieval part of a switch or load plan. */
const retrievalOf = ({ capability, scope, parameters, refinement }: Retrieval): Retrieval => ({
  capability,
  scope,
  ...(parameters ? { parameters } : {}),
  ...(refinement ? { refinement } : {}),
});

/**
 * What a data request means given the facts (AC-6 c, d, f; TASK-005 AC-6). Pure, so phases B and C
 * agree. A time series is the same data only when its filter and comparison match too; its
 * interval and measure are view settings and never retrieve.
 */
function planRequest(facts: SessionFacts, action: RequestDataAction): RequestPlan {
  const { scope: requestedScope, refinement } = action;
  const capability = getCapability(action.capability);
  if (!capability) return { kind: "unsupported" };

  // A request without a scope inherits the active one; with nothing to inherit, ask first (d).
  let scope: Scope;
  if (!requestedScope?.start_date && !requestedScope?.end_date) {
    if (!facts.active)
      return {
        kind: "clarify",
        question: "Which period should I use? Please give a start and end date.",
      };
    scope = facts.active.scope;
  } else {
    const checked = validateScope(requestedScope);
    if (!checked.ok) return { kind: "clarify", question: checked.issue.message };
    scope = checked.scope;
  }

  // Retrieval parameters, interval, and measure (AC-3); other capabilities accept none of them.
  const params = validateRequestParameters(capability.id, scope, action.parameters, refinement);
  if (!params.ok) return { kind: "clarify", question: clarifyText(capability, params.issue) };
  const isSeries = capability.id === SALES_TIME_SERIES;
  const retrieval = retrievalOf({
    capability: capability.id,
    scope,
    ...(isSeries ? { parameters: params.parameters } : {}),
    ...(refinement ? { refinement } : {}),
  });

  const active = facts.active;
  if (!active) return { kind: "load", ...retrieval };
  const sameData =
    active.capability === capability.id &&
    active.scope.start_date === scope.start_date &&
    active.scope.end_date === scope.end_date &&
    (!isSeries || sameParameters(scope, active.parameters ?? {}, params.parameters));
  if (sameData) return { kind: "same_data", refinement: refinement ?? {} };
  return { kind: "propose", pending: { type: "switch", ...retrieval } };
}

/** The retrieval phase B must do for this decision, or null when the outcome needs no new data. */
function retrievalFor(facts: SessionFacts, decision: TurnDecision): Retrieval | null {
  const action = decision.action;
  if (action.type === "confirm_switch") {
    const pending = facts.pending;
    return action.accept && pending?.type === "switch" ? retrievalOf(pending) : null;
  }
  if (action.type === "request_data") {
    const plan = planRequest(facts, action);
    return plan.kind === "load" ? retrievalOf(plan) : null;
  }
  return null;
}

/** The current view's settings the registry checks a refinement against. */
const viewContext = (view: ViewSettings): ViewContext => ({
  ...(view.interval ? { interval: view.interval } : {}),
  ...(view.group_by ? { group_by: view.group_by } : {}),
});

/**
 * New filters replace earlier ones on the same field; other settings change only when given.
 * While grouped by brand, a limit is the number of brands shown and the product row limit stays
 * (TASK-005 AC-8); `group_by: none` returns to product rows.
 */
export function applyRefinement(view: ViewSettings, refinement: Refinement): ViewSettings {
  let filters = refinement.clear_filters ? [] : view.filters;
  for (const filter of refinement.filters ?? []) {
    filters = [...filters.filter((f) => f.field !== filter.field), filter];
  }
  const group = refinement.group_by === "none" ? undefined : (refinement.group_by ?? view.group_by);
  const next: ViewSettings = {
    ...view,
    filters,
    sort: refinement.sort ? { ...refinement.sort } : view.sort,
    limit: group ? view.limit : (refinement.limit ?? view.limit),
    ...(refinement.interval ? { interval: refinement.interval } : {}),
    ...(refinement.measure ? { measure: refinement.measure as ViewSettings["measure"] } : {}),
  };
  // Rebuilt below, so a group change never keeps a stale brand number.
  delete next.group_by;
  delete next.groupLimit;
  if (!group) return next;
  next.group_by = group;
  if (group === "brand") {
    const keep = view.group_by === "brand" ? view.groupLimit : undefined;
    next.groupLimit = refinement.limit ?? keep ?? DEFAULT_BRAND_GROUPS;
  }
  return next;
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
