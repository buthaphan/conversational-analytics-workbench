import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/ui/FormField";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { cn } from "../lib/cn";
import { AnalysisCardView } from "./AnalysisCardView";
import {
  type AnalysisState,
  type ApiResult,
  chooseSwitch,
  getAnalysisState,
  sendMessage,
} from "./api";
import { formatDateRange } from "./format";
import { ResultArea, ScopeSummary } from "./ResultView";

const MAX_LENGTH = 500;

export interface WorkspaceProps {
  /** Called when the API answers 401: the login session has ended. */
  onSessionEnded: () => void;
}

type Load =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; demoExamples: string[] | null };

/**
 * The analysis workspace (TASK-003 AC-16): scope summary, result area, conversation, and input.
 * All state lives on the server, so a refresh restores it (AC-13).
 */
export function Workspace({ onSessionEnded }: WorkspaceProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [state, setState] = useState<AnalysisState>({
    messages: [],
    activeResult: null,
    pending: null,
    notice: null,
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // Keyed by a counter so a repeated reply is a new node, which screen readers announce (review R6).
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const messageCount = state.messages.length;

  // Keep the newest message in view inside the conversation panel.
  useEffect(() => {
    const history = historyRef.current;
    if (history && messageCount > 0) history.scrollTo?.({ top: history.scrollHeight });
  }, [messageCount]);

  const fetchState = useCallback(async () => {
    setLoad({ kind: "loading" });
    const result = await getAnalysisState();
    if (!result.ok) {
      if (result.error === "signed-out") onSessionEnded();
      else setLoad({ kind: "error" });
      return;
    }
    const { demoExamples, ...rest } = result.data;
    setState(rest);
    setLoad({ kind: "ready", demoExamples });
  }, [onSessionEnded]);

  useEffect(() => {
    // Loading the server state is this effect's purpose; setState after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchState();
  }, [fetchState]);

  async function run(
    request: () => Promise<ApiResult<{ reply: { text: string }; state: AnalysisState }>>,
    sent?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setSendFailed(false);
    const result = await request();
    setBusy(false);
    if (!result.ok) {
      if (result.error === "signed-out") onSessionEnded();
      else setSendFailed(true);
      return;
    }
    const stored = result.data.state.messages.length > state.messages.length;
    setState(result.data.state);
    if (stored) {
      setAnnouncement((previous) => ({ id: previous.id + 1, text: result.data.reply.text }));
      // Compare with the current input, not the value when sending, so text typed while waiting
      // is kept (review R5). A message that was not stored (the limit) keeps its text too (R2).
      if (sent !== undefined) setText((current) => (current.trim() === sent ? "" : current));
    }
    inputRef.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (message) void run(() => sendMessage(message), message);
  }

  if (load.kind === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading your analysis" className="size-6 text-fg-secondary" />
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error">Could not load your analysis.</Alert>
        <Button variant="secondary" onClick={() => void fetchState()}>
          Try again
        </Button>
      </div>
    );
  }

  const { activeResult, pending, messages } = state;
  return (
    <div className="flex flex-col gap-6">
      {load.demoExamples && (
        <div className="flex flex-col gap-3">
          {/* The banner is a polite status region; the example buttons stay outside it (review R11). */}
          <Alert variant="info" title="Demo mode">
            <p>
              This development model only understands the example questions below. Select one to
              send it.
            </p>
          </Alert>
          <ul className="flex flex-wrap gap-2" aria-label="Example questions">
            {load.demoExamples.map((example) => (
              <li key={example}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-auto min-h-8 py-1 whitespace-normal text-left"
                  onClick={() => void run(() => sendMessage(example))}
                >
                  {example}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {activeResult ? (
            <>
              <ScopeSummary result={activeResult} />
              <ResultArea result={activeResult} />
            </>
          ) : (
            <Card title="No data yet" headingLevel={2}>
              <p className="text-body text-fg-secondary">
                Ask a question about customer spending or product sales to start. I&apos;ll confirm
                the period before loading data.
              </p>
            </Card>
          )}
        </div>

        {/* On wide screens the conversation stays beside the result while the page scrolls. */}
        <section
          aria-labelledby="conversation-heading"
          className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start"
        >
          <h2 id="conversation-heading" className="text-h2 text-fg">
            Conversation
          </h2>
          {messages.length > 0 && (
            // A fixed-height panel that scrolls on its own, so the page (and the result) does not
            // move as the conversation grows. Focusable so keyboard users can scroll it.
            <div
              ref={historyRef}
              role="region"
              aria-label="Conversation history"
              tabIndex={0}
              className={cn(
                "max-h-[50vh] overflow-y-auto rounded-lg lg:max-h-[calc(100vh-20rem)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              <ol aria-label="Conversation" className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li
                    key={m.seq}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-3 text-body-sm",
                      m.role === "user"
                        ? "border-border bg-surface-muted"
                        : "border-border bg-surface",
                    )}
                  >
                    <span className="text-label text-fg-secondary">
                      {m.role === "user" ? "You" : "Assistant"}
                    </span>
                    <p className="text-fg">{m.text}</p>
                    {m.card && <AnalysisCardView card={m.card} />}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pending?.type === "switch" && (
            <div
              role="group"
              aria-label="Switch dataset?"
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <p className="text-body-sm text-fg">
                Switch to {pending.capability.replaceAll("_", " ")} for{" "}
                {formatDateRange(pending.scope)}? Your current result will be replaced.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={() => void run(() => chooseSwitch("switch"))}>
                  Switch
                </Button>
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() => void run(() => chooseSwitch("keep"))}
                >
                  Keep current
                </Button>
              </div>
            </div>
          )}

          {state.notice && <Alert variant="warning">{state.notice}</Alert>}
          {sendFailed && <Alert variant="error">Could not send your message. Try again.</Alert>}

          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField label="Ask a question" className="flex-1">
              {(control) => (
                <Input
                  {...control}
                  ref={inputRef}
                  value={text}
                  maxLength={MAX_LENGTH}
                  autoComplete="off"
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" loading={busy}>
              Send
            </Button>
          </form>

          {/* New assistant replies are announced politely; the log itself is not a live region. */}
          <div data-testid="reply-announcer" aria-live="polite" className="sr-only">
            {announcement.text && <p key={announcement.id}>{announcement.text}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
