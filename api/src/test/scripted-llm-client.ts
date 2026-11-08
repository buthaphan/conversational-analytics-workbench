import type { ModelContext } from "../analysis/context/model-context";
import { LlmClient } from "../analysis/llm/llm-client";

/** Test double: returns queued outputs in order and records each context it was given. */
export class ScriptedLlmClient extends LlmClient {
  readonly calls: { context: ModelContext; userText: string }[] = [];
  private readonly queue: unknown[] = [];
  private failing = false;

  push(...outputs: unknown[]): void {
    this.queue.push(...outputs);
  }

  /** Makes the next call throw, as a network or API error would. */
  failNext(): void {
    this.failing = true;
  }

  async decide(context: ModelContext, userText: string): Promise<unknown> {
    this.calls.push({ context, userText });
    if (this.failing) {
      this.failing = false;
      throw new Error("scripted model failure");
    }
    if (this.queue.length === 0) throw new Error("ScriptedLlmClient: no output queued");
    return this.queue.shift();
  }
}
