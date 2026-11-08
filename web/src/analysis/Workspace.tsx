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
const STILL_ANSWERING = "Still answering your last message…";
const TURN_DROPPED = "Your last message wasn't answered. Please send it again.";
const WAIT_MESSAGE = "Please wait for the current reply.";

export interface WorkspaceProps {
  /** Called when the API answers 401: the login session has ended. */
  onSessionEnded: () => void;
  /** How often to re-read the state while a turn is in progress (TASK-004 AC-2). */
  pollIntervalMs?: number;
  /** Stop waiting after this long; matches the API's turn deadline. */
  turnDeadlineMs?: number;
}

type Load =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; demoExamples: string[] | null };

/**
 * The analysis workspace (TASK-003 AC-16): scope summary, result area, conversation, and input.
 * All state lives on the server, so a refresh restores it (AC-13).
 */
/** The analysis state from a state response, without the demo examples. */
function withoutExamples(data: AnalysisState & { demoExamples?: unknown }): AnalysisState {
  const { messages, activeResult, pending, notice, turnInProgress } = data;
  return { messages, activeResult, pending, notice, turnInProgress };
}

export function Workspace({
  onSessionEnded,
  pollIntervalMs = 2000,
  turnDeadlineMs = 120_000,
}: WorkspaceProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [state, setState] = useState<AnalysisState>({
    messages: [],
    activeResult: null,
    pending: null,
    notice: null,
    turnInProgress: false,
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // The running turn took longer than the deadline: stop waiting and offer a retry.
  const [stalled, setStalled] = useState(false);
  // The last turn ended without an answer (expired or superseded on the server).
  const [dropped, setDropped] = useState(false);
  // Keyed by a counter so a repeated reply is a new node, which screen readers announce (review R6).
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  const announce = useCallback(
    (text: string) => setAnnouncement((previous) => ({ id: previous.id + 1, text })),
    [],
  );
  // Another turn (for example from before a refresh) is still being answered (TASK-004 AC-2).
  const waiting = state.turnInProgress && !stalled;
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

  // While a turn is in progress, re-read the state until it is answered or the deadline passes.
  // If it ends without a new message, the server dropped it (expired): say so (review R1).
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const countAtStart = messageCount;
    let stopped = false;
    let inFlight = false;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
    };
    const timer = setInterval(() => {
      if (stopped || inFlight) return;
      if (Date.now() - started >= turnDeadlineMs) {
        stop();
        setStalled(true);
        return;
      }
      inFlight = true;
      void getAnalysisState().then((result) => {
        inFlight = false;
        if (stopped) return;
        if (!result.ok) {
          if (result.error === "signed-out") {
            stop();
            onSessionEnded();
          }
          return; // other errors: try again on the next tick
        }
        if (result.data.turnInProgress) return;
        const next = withoutExamples(result.data);
        stop();
        setState(next);
        if (next.messages.length <= countAtStart) {
          setDropped(true);
          announce(TURN_DROPPED);
          return;
        }
        const last = next.messages.at(-1);
        if (last?.role === "assistant") announce(last.text);
      });
    }, pollIntervalMs);
    return stop;
    // messageCount is read once when waiting begins; it does not change while waiting.
  }, [waiting, pollIntervalMs, turnDeadlineMs, onSessionEnded, announce, messageCount]);

  function retryAfterStall() {
    setStalled(false);
    void fetchState();
  }

  async function run(
    request: () => Promise<ApiResult<{ reply: { text: string }; state: AnalysisState }>>,
    sent?: string,
  ) {
    if (busy || waiting) {
      // The Send button shows the wait visually; screen readers hear it too (review N1).
      announce(WAIT_MESSAGE);
      return;
    }
    setBusy(true);
    setSendFailed(false);
    setDropped(false);
    const result = await request();
    setBusy(false);
    if (!result.ok) {
      if (result.error === "signed-out") onSessionEnded();
      else if (result.error === "turn-dropped") {
        // This turn outlived the deadline and was discarded (review S4); the typed text stays.
        // A newer turn (another tab) replaced it, so show the current conversation.
        setDropped(true);
        announce(TURN_DROPPED);
        void getAnalysisState().then((latest) => {
          if (latest.ok) setState(withoutExamples(latest.data));
          else if (latest.error === "signed-out") onSessionEnded();
        });
      } else if (result.error === "turn-in-progress") {
        // Another turn is running (TASK-004 AC-1): wait for it; the typed text stays.
        setStalled(false);
        setState((current) => ({ ...current, turnInProgress: true }));
        announce(STILL_ANSWERING);
      } else setSendFailed(true);
      return;
    }
    const stored = result.data.state.messages.length > state.messages.length;
    setState(result.data.state);
    // Announce every reply, including a refusal that stored no message (the limit, review N1).
    announce(result.data.reply.text);
    if (stored) {
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
  // With a result, the conversation column fills the height the result column sets.
  const fill = activeResult !== null && messages.length > 0;
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

      {/*
        On wide screens the grid is at least as tall as the window below the header (header and
        page padding: 9.5rem), so the result card and the conversation reach the bottom of the
        window (TASK-004 DEC-004). Not in demo mode, where the banner sits above the grid.
      */}
      <div
        data-testid="workspace-grid"
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
          !load.demoExamples && "lg:min-h-[calc(100vh_-_9.5rem)]",
        )}
      >
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

        {/*
          With a result on wide screens, the conversation is taken out of the grid's height
          calculation and fills the row the result column sets, so both columns end together
          (TASK-004 DEC-004). Without one, it keeps its own window-based height.
        */}
        {/* A minimum height keeps the panel usable beside a short result, e.g. in demo mode (review S1). */}
        <div className={cn("min-w-0", fill && "lg:relative lg:min-h-[28rem]")}>
          <section
            aria-labelledby="conversation-heading"
            className={cn(
              "flex min-w-0 flex-col gap-4",
              fill ? "lg:absolute lg:inset-0" : "lg:sticky lg:top-6",
            )}
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
                  // The bordered frame is the scroll container, so its edge stays put (TASK-004 DEC-004).
                  "max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-surface p-2",
                  fill ? "lg:max-h-none lg:min-h-0 lg:flex-1" : "lg:max-h-[calc(100vh-20rem)]",
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
                  <Button
                    loading={busy || waiting}
                    onClick={() => void run(() => chooseSwitch("switch"))}
                  >
                    Switch
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy || waiting}
                    onClick={() => void run(() => chooseSwitch("keep"))}
                  >
                    Keep current
                  </Button>
                </div>
              </div>
            )}

            {waiting && <Alert variant="info">{STILL_ANSWERING}</Alert>}
            {dropped && <Alert variant="warning">{TURN_DROPPED}</Alert>}
            {stalled && (
              <div className="flex flex-col items-start gap-3">
                <Alert variant="warning">
                  This is taking longer than expected. Try again in a moment.
                </Alert>
                <Button variant="secondary" onClick={retryAfterStall}>
                  Try again
                </Button>
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
                    // While busy, the Send button cancels its own activation, so Enter would not
                    // submit; say why instead of dropping the message silently (review N1).
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (busy || waiting)) announce(WAIT_MESSAGE);
                    }}
                  />
                )}
              </FormField>
              <Button type="submit" loading={busy || waiting}>
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
    </div>
  );
}
