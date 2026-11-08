import type { ModelContext } from "../context/model-context";

/**
 * The model behind each turn (TASK-003 AC-14). It receives only the model context and returns raw,
 * untrusted output that the orchestrator parses as a TurnDecision. TASK-004 adds the Claude adapter.
 */
export abstract class LlmClient {
  /** Example prompts the web app offers; only the demo model has them (AC-15). */
  readonly demoExamples: string[] | null = null;

  /** `userText` is the latest message; it is also the last entry of `context.recentTurns`. */
  abstract decide(context: ModelContext, userText: string): Promise<unknown>;
}

/** `ANALYSIS_MODEL=none`: every turn fails safely with the generic reply until a model is configured. */
export class UnconfiguredLlmClient extends LlmClient {
  async decide(): Promise<unknown> {
    throw new Error("No analysis model is configured (ANALYSIS_MODEL=none).");
  }
}
