import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { mockFetch } from "../test/fetch";
import type { ActiveResult, AnalysisState } from "./api";
import { Workspace } from "./Workspace";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: unknown }) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  ),
}));
vi.mock("echarts", () => ({ registerTheme: () => {} }));

const empty: AnalysisState = {
  messages: [],
  activeResult: null,
  pending: null,
  notice: null,
  turnInProgress: false,
};
const examples = ["Who spent the most last year?", "Show this as a table"];

const result: ActiveResult = {
  capability: "customer_spending",
  title: "Customer spending",
  rowNoun: ["customer", "customers"],
  scope: { start_date: "2025-01-01", end_date: "2026-01-01" },
  fields: [
    { name: "customer_id", label: "Customer ID", kind: "id" },
    { name: "customer_name", label: "Customer", kind: "label" },
    { name: "total_spend", label: "Total spend", kind: "money" },
    { name: "order_count", label: "Orders", kind: "integer" },
  ],
  rowCount: 1412,
  filteredCount: 87,
  rows: [
    { customer_id: "C0001", customer_name: "Ada Park", total_spend: 1234.5, order_count: 3 },
    { customer_id: "C0002", customer_name: "Ben Ruiz", total_spend: 980, order_count: 2 },
  ],
  view: {
    filters: [{ field: "total_spend", op: "gt", value: 500 }],
    sort: { field: "total_spend", direction: "desc" },
    limit: 10,
    view: "bar",
  },
};

const loaded: AnalysisState = {
  messages: [
    { seq: 1, role: "user", text: "The previous calendar year" },
    { seq: 2, role: "assistant", text: "Showing 2 of 87 customers…" },
  ],
  activeResult: result,
  pending: null,
  notice: null,
  turnInProgress: false,
};

const stateRoute = (state: AnalysisState, demoExamples: string[] | null = null) => ({
  "GET /api/analysis/state": { status: 200, body: { ...state, demoExamples } },
});

describe("analysis workspace (TASK-003 AC-16, AC-15, AC-13)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state, the demo banner, and example prompts before the first question", async () => {
    mockFetch(stateRoute(empty, examples));
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    expect(
      await screen.findByText(/ask a question about customer spending or product sales/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Demo mode")).toBeInTheDocument();
    for (const example of examples)
      expect(screen.getByRole("button", { name: example })).toBeInTheDocument();
    // The examples are controls, so they sit outside the banner's polite status region (review R11).
    const banner = screen.getByText("Demo mode").closest('[role="status"]');
    expect(banner).not.toBeNull();
    expect(within(banner as HTMLElement).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("has no demo banner with a real model", async () => {
    mockFetch(stateRoute(empty));
    render(<Workspace onSessionEnded={() => {}} />);
    await screen.findByRole("textbox", { name: "Ask a question" });
    expect(screen.queryByText("Demo mode")).not.toBeInTheDocument();
  });

  it("restores the conversation and result after a refresh, with the scope summary and a bar chart with its table", async () => {
    mockFetch(stateRoute(loaded));
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    const summary = await screen.findByRole("region", { name: "Customer spending" });
    expect(summary).toHaveTextContent("1 Jan 2025 – 31 Dec 2025");
    expect(summary).toHaveTextContent("1,412 customers in the result");
    expect(summary).toHaveTextContent("87 match the filters");
    expect(summary).toHaveTextContent("Total spend over $500.00");
    expect(screen.getByTestId("echarts")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Ada Park" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "$1,234.50" })).toBeInTheDocument();
    const log = screen.getByRole("list", { name: "Conversation" });
    expect(within(log).getByText("The previous calendar year")).toBeInTheDocument();
    expect(within(log).getByText("Showing 2 of 87 customers…")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows a table with every field when the view is a table", async () => {
    mockFetch(
      stateRoute({
        ...loaded,
        activeResult: { ...result, view: { ...result.view, view: "table" } },
      }),
    );
    render(<Workspace onSessionEnded={() => {}} />);
    const table = await screen.findByRole("table");
    expect(screen.queryByTestId("echarts")).not.toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Customer", "Customer ID", "Total spend", "Orders"]);
    expect(within(table).getByRole("cell", { name: "3" })).toBeInTheDocument();
  });

  it("fills the window height on wide screens, letting the chart take the spare room (TASK-004 DEC-004)", async () => {
    mockFetch(stateRoute(loaded));
    render(<Workspace onSessionEnded={() => {}} />);
    const chart = await screen.findByRole("img", { name: /chart\. Exact values/ });
    // The two-column grid is at least as tall as the window below the header.
    const grid = chart.closest("[data-testid='workspace-grid']") as HTMLElement;
    expect(grid.className).toMatch(/lg:min-h-\[[^\]]*100vh/);
    // The result card and the chart stretch; the chart keeps a minimum height.
    expect(chart.className).toMatch(/(^|\s)lg:flex-1(\s|$)/);
    expect(chart.className).toMatch(/(^|\s)min-h-56(\s|$)/);
    expect(chart.closest("section")?.className).toMatch(/(^|\s)lg:flex-1(\s|$)/);
  });

  it("keeps a minimum conversation height when it follows the result column (review S1)", async () => {
    mockFetch(stateRoute(loaded, examples));
    render(<Workspace onSessionEnded={() => {}} />);
    const history = await screen.findByRole("region", { name: "Conversation history" });
    const wrapper = history.closest("section")?.parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/(^|\s)lg:min-h-\[28rem\](\s|$)/);
  });

  it("matches the conversation's height to the result column on wide screens (TASK-004 DEC-004)", async () => {
    mockFetch(stateRoute(loaded));
    render(<Workspace onSessionEnded={() => {}} />);
    const history = await screen.findByRole("region", { name: "Conversation history" });
    const section = history.closest("section") as HTMLElement;
    // Out of the grid's height calculation, filling the row the result column sets.
    expect(section.className).toMatch(/(^|\s)lg:absolute(\s|$)/);
    expect(section.className).toMatch(/(^|\s)lg:inset-0(\s|$)/);
    expect(history.className).toMatch(/(^|\s)lg:flex-1(\s|$)/);
    expect(history.className).toMatch(/(^|\s)lg:min-h-0(\s|$)/);
  });

  it("scrolls the conversation inside a fixed, bordered frame (TASK-004 DEC-004)", async () => {
    mockFetch(stateRoute(loaded));
    render(<Workspace onSessionEnded={() => {}} />);
    const history = await screen.findByRole("region", { name: "Conversation history" });
    expect(history.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(history.className).toMatch(/(^|\s)border(\s|$)/);
  });

  it("keeps the result table in a keyboard-scrollable region, in both views (TASK-004 DEC-004)", async () => {
    mockFetch(stateRoute(loaded));
    const { unmount } = render(<Workspace onSessionEnded={() => {}} />);
    const chartTable = await screen.findByRole("region", {
      name: "Total spend by customer (highest first)",
    });
    expect(chartTable).toHaveAttribute("tabindex", "0");
    expect(chartTable.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    // On wide screens the table takes the height left in the window, so the page does not scroll.
    expect(chartTable.className).toMatch(/lg:max-h-\[[^\]]*100vh/);
    // The chart title above already names it, so the table caption is only for screen readers.
    expect(
      within(chartTable).getByText("Total spend by customer (highest first)").className,
    ).toMatch(/(^|\s)sr-only(\s|$)/);
    expect(within(chartTable).getByRole("table")).toBeInTheDocument();
    unmount();

    mockFetch(
      stateRoute({
        ...loaded,
        activeResult: { ...result, view: { ...result.view, view: "table" } },
      }),
    );
    render(<Workspace onSessionEnded={() => {}} />);
    const table = await screen.findByRole("region", {
      name: "Total spend by customer (highest first)",
    });
    expect(table).toHaveAttribute("tabindex", "0");
    expect(table.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(table.className).toMatch(/lg:max-h-\[[^\]]*100vh/);
  });

  it("sends a message, announces the reply politely, and keeps focus in the input", async () => {
    const fetchMock = mockFetch({
      ...stateRoute(empty, examples),
      "POST /api/analysis/messages": {
        status: 200,
        body: { reply: { text: "Showing 2 of 87 customers…" }, state: loaded },
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "The previous calendar year");
    await u.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("region", { name: "Customer spending" })).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    const live = screen.getByTestId("reply-announcer");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Showing 2 of 87 customers…");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ text: "The previous calendar year" });
  });

  it("keeps the conversation in its own scrolling panel, scrolled to the newest message (walkthrough feedback)", async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    mockFetch({
      ...stateRoute(loaded),
      "POST /api/analysis/messages": {
        status: 200,
        body: {
          reply: { text: "Hi" },
          state: {
            ...loaded,
            messages: [...loaded.messages, { seq: 3, role: "assistant", text: "Hi" }],
          },
        },
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const history = await screen.findByRole("region", { name: "Conversation history" });
    expect(history).toHaveAttribute("tabindex", "0");
    expect(history.className).toMatch(/overflow-y-auto/);
    expect(history.className).toMatch(/max-h-/);
    scrollTo.mockClear();
    await u.type(screen.getByRole("textbox", { name: "Ask a question" }), "hello{Enter}");
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    expect(scrollTo.mock.contexts.at(-1)).toBe(history);
  });

  it("shows the Send button as busy while a reply is on its way, and sends on Enter", async () => {
    let answer: (value: Response) => void = () => {};
    mockFetch(stateRoute(empty));
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => (answer = resolve))
        : original(input, init),
    );
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    await u.type(await screen.findByRole("textbox", { name: "Ask a question" }), "hello{Enter}");
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute("aria-busy", "true");
    answer(
      new Response(
        JSON.stringify({
          reply: { text: "Hi" },
          state: { ...empty, messages: [{ seq: 1, role: "assistant", text: "Hi" }] },
        }),
        { status: 200 },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).not.toHaveAttribute("aria-busy", "true"),
    );
  });

  it("sends an example prompt when it is clicked", async () => {
    const fetchMock = mockFetch({
      ...stateRoute(empty, examples),
      "POST /api/analysis/messages": { status: 200, body: { reply: { text: "ok" }, state: empty } },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Show this as a table" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ text: "Show this as a table" });
  });

  it("offers Switch and Keep current for a pending switch, and sends the choice", async () => {
    const proposal =
      "Your current result covers customer spending for 1 Jan 2025 – 31 Dec 2025. This question needs product sales performance for 1 Jan 2025 – 31 Dec 2025. Would you like to explore anything further from your current dataset, or should I switch to the new dataset?";
    const pendingState: AnalysisState = {
      ...loaded,
      messages: [
        ...loaded.messages,
        { seq: 3, role: "user", text: "Show product sales instead" },
        { seq: 4, role: "assistant", text: proposal },
      ],
      pending: { type: "switch", capability: "product_sales_performance", scope: result.scope },
    };
    const fetchMock = mockFetch({
      ...stateRoute(pendingState),
      "POST /api/analysis/switch": {
        status: 200,
        body: { reply: { text: "Okay, staying with your current dataset." }, state: loaded },
      },
    });
    const u = userEvent.setup();
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    const prompt = await screen.findByRole("group", { name: "Switch dataset?" });
    expect(within(prompt).getByRole("button", { name: "Switch" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await u.click(within(prompt).getByRole("button", { name: "Keep current" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Switch dataset?" })).not.toBeInTheDocument(),
    );
    const post = fetchMock.mock.calls.find(([url]) => String(url) === "/api/analysis/switch");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ choice: "keep" });
  });

  it("shows analysis figures with their base in a result card", async () => {
    mockFetch(
      stateRoute({
        ...loaded,
        messages: [
          ...loaded.messages,
          {
            seq: 3,
            role: "assistant",
            text: "Based on all 1,412 customers, 1 Jan 2025 – 31 Dec 2025: the top 142 customers account for 38.4% of total spend ($21,000.00 of $54,700.00).",
            card: {
              operation: "concentration",
              target: "complete",
              baseCount: 1412,
              measure: "total_spend",
              topRows: 142,
              topTotal: 21000,
              total: 54700,
              share: 0.3839,
              rowNoun: ["customer", "customers"],
              fields: result.fields,
            },
          },
        ],
      }),
    );
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    const card = await screen.findByRole("table", { name: "Concentration of total spend" });
    expect(within(card).getByRole("cell", { name: "38.4%" })).toBeInTheDocument();
    expect(within(card).getByRole("cell", { name: "All 1,412 customers" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the message limit on screen and keeps the typed text (review R2)", async () => {
    const limit =
      "This conversation has reached its message limit. Sign out and in again to start a fresh analysis.";
    mockFetch({
      ...stateRoute(loaded),
      "POST /api/analysis/messages": {
        status: 200,
        body: { reply: { text: limit }, state: { ...loaded, notice: limit } },
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "one more{Enter}");
    expect(
      await screen.findByText(limit, { ignore: "[data-testid=reply-announcer] *" }),
    ).toBeVisible();
    expect(input).toHaveValue("one more");
  });

  it("announces a refusal at the limit even though no message was stored (review N1)", async () => {
    const limit = "Limit reached.";
    mockFetch({
      ...stateRoute({ ...loaded, notice: limit }),
      "POST /api/analysis/messages": {
        status: 200,
        body: { reply: { text: limit }, state: { ...loaded, notice: limit } },
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "again{Enter}");
    await waitFor(() => expect(screen.getByTestId("reply-announcer")).toHaveTextContent(limit));
    expect(input).toHaveValue("again");
  });

  it("says so when a message is sent while a reply is still on its way (review N1)", async () => {
    mockFetch(stateRoute(empty));
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === "POST" ? new Promise<Response>(() => {}) : original(input, init),
    );
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "first{Enter}");
    await u.clear(input);
    await u.type(input, "second{Enter}");
    expect(screen.getByTestId("reply-announcer")).toHaveTextContent(
      "Please wait for the current reply.",
    );
    expect(input).toHaveValue("second");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("shows the message limit after a refresh", async () => {
    const limit = "Limit reached.";
    mockFetch(stateRoute({ ...loaded, notice: limit }));
    render(<Workspace onSessionEnded={() => {}} />);
    expect(await screen.findByText(limit)).toBeVisible();
  });

  it("keeps text typed while a reply was on its way (review R5)", async () => {
    let answer: (value: Response) => void = () => {};
    mockFetch(stateRoute(empty));
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => (answer = resolve))
        : original(input, init),
    );
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "first{Enter}");
    await u.type(input, " second");
    const messages = [
      { seq: 1, role: "user", text: "first" },
      { seq: 2, role: "assistant", text: "Hi" },
    ];
    answer(
      new Response(JSON.stringify({ reply: { text: "Hi" }, state: { ...empty, messages } }), {
        status: 200,
      }),
    );
    await screen.findByText("Hi", { selector: "li p" });
    expect(input).toHaveValue("first second");
  });

  it("announces a reply again even when its text repeats (review R6)", async () => {
    const sorry = "Sorry, I couldn't process that. Please rephrase.";
    let count = 0;
    mockFetch({
      ...stateRoute(empty),
      "POST /api/analysis/messages": () => {
        count += 2;
        const messages = Array.from({ length: count }, (_, i) => ({
          seq: i + 1,
          role: i % 2 === 0 ? "user" : "assistant",
          text: i % 2 === 0 ? "???" : sorry,
        }));
        return { status: 200, body: { reply: { text: sorry }, state: { ...empty, messages } } };
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "???{Enter}");
    const live = screen.getByTestId("reply-announcer");
    await waitFor(() => expect(live).toHaveTextContent(sorry));
    const first = live.firstElementChild;
    expect(first).not.toBeNull();
    await u.type(input, "???{Enter}");
    await waitFor(() => expect(live.firstElementChild).not.toBe(first));
    expect(live).toHaveTextContent(sorry);
  });

  it("returns to sign-in when the session has ended", async () => {
    mockFetch({ "GET /api/analysis/state": { status: 401, body: {} } });
    const ended = vi.fn();
    render(<Workspace onSessionEnded={ended} />);
    await waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
  });

  it("keeps the typed text and shows an error when a message cannot be sent", async () => {
    mockFetch({ ...stateRoute(empty), "POST /api/analysis/messages": "network-error" });
    const u = userEvent.setup();
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "hello");
    await u.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not send your message. Try again.",
    );
    expect(input).toHaveValue("hello");
    await expectNoAxeViolations(container);
  });

  it("shows an error with a retry when the workspace cannot load", async () => {
    let reachable = false;
    mockFetch({
      "GET /api/analysis/state": () =>
        reachable ? { status: 200, body: { ...empty, demoExamples: null } } : "network-error",
    });
    const u = userEvent.setup();
    const { container } = render(<Workspace onSessionEnded={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your analysis.");
    await expectNoAxeViolations(container);
    reachable = true;
    await u.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
  });
});

describe("a turn in progress (TASK-004 AC-2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const STILL = "Still answering your last message…";
  const answered: AnalysisState = {
    ...loaded,
    messages: [
      { seq: 1, role: "user", text: "The previous calendar year" },
      { seq: 2, role: "assistant", text: "Showing 2 of 87 customers…" },
    ],
  };
  /** Serves the given states in order; the last one repeats. */
  const states = (...list: AnalysisState[]) => {
    let i = 0;
    return {
      "GET /api/analysis/state": () => ({
        status: 200,
        body: { ...list[Math.min(i++, list.length - 1)], demoExamples: null },
      }),
    };
  };
  const fast = { pollIntervalMs: 10, turnDeadlineMs: 5000 };

  it("after a refresh mid-turn, shows the notice, blocks sending, and shows the answer when it lands", async () => {
    mockFetch(
      states({ ...empty, turnInProgress: true }, { ...empty, turnInProgress: true }, answered),
    );
    const u = userEvent.setup();
    const { container } = render(<Workspace onSessionEnded={() => {}} {...fast} />);
    expect(await screen.findByText(STILL)).toBeInTheDocument();
    expect(screen.getByText(STILL).closest('[role="status"]')).not.toBeNull();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    await expectNoAxeViolations(container);

    // Typing stays possible, so nothing is lost.
    await u.type(screen.getByRole("textbox", { name: "Ask a question" }), "next");

    const log = await screen.findByRole("list", { name: "Conversation" });
    expect(within(log).getByText("Showing 2 of 87 customers…")).toBeInTheDocument();
    expect(screen.queryByText(STILL)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("reply-announcer")).toHaveTextContent("Showing 2 of 87 customers…");
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toHaveValue("next");
  });

  it("on a 409 reply, keeps the typed text, shows the notice, and waits for the running turn", async () => {
    let posted = false;
    mockFetch({
      "GET /api/analysis/state": () => ({
        status: 200,
        body: posted
          ? { ...answered, turnInProgress: false, demoExamples: null }
          : { ...empty, turnInProgress: false, demoExamples: null },
      }),
      "POST /api/analysis/messages": () => {
        posted = true;
        return { status: 409, body: { code: "turn_in_progress", message: "busy" } };
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} {...fast} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "hello");
    await u.click(screen.getByRole("button", { name: "Send" }));
    const log = await screen.findByRole("list", { name: "Conversation" });
    expect(within(log).getByText("The previous calendar year")).toBeInTheDocument();
    expect(input).toHaveValue("hello");
    expect(screen.queryByText("Could not send your message. Try again.")).not.toBeInTheDocument();
  });

  it("returns to sign-in when the session ends while waiting", async () => {
    let calls = 0;
    mockFetch({
      "GET /api/analysis/state": () =>
        calls++ === 0
          ? { status: 200, body: { ...empty, turnInProgress: true, demoExamples: null } }
          : { status: 401, body: {} },
    });
    const ended = vi.fn();
    render(<Workspace onSessionEnded={ended} {...fast} />);
    await waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
  });

  // Neutral wording: the turn may have expired or failed (review round 2).
  const DROPPED = "Your last message wasn't answered. Please send it again.";

  it("says so when the turn ends without an answer, as the real API reports an expired turn (review R1)", async () => {
    // Waiting began with 2 messages; the turn then expires on the server with no new message.
    mockFetch(
      states({ ...answered, turnInProgress: true }, { ...answered, turnInProgress: false }),
    );
    const { container } = render(<Workspace onSessionEnded={() => {}} {...fast} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(DROPPED);
    expect(screen.queryByText(STILL)).not.toBeInTheDocument();
    expect(screen.getByTestId("reply-announcer")).toHaveTextContent(DROPPED);
    expect(screen.getByRole("button", { name: "Send" })).not.toHaveAttribute("aria-disabled");
    await expectNoAxeViolations(container);
  });

  it("does not show the dropped message when the answer arrives", async () => {
    mockFetch(states({ ...empty, turnInProgress: true }, answered));
    render(<Workspace onSessionEnded={() => {}} {...fast} />);
    await screen.findByRole("list", { name: "Conversation" });
    expect(screen.queryByText(DROPPED)).not.toBeInTheDocument();
  });

  it("tells the user a dropped turn was not answered, keeping the typed text, and refreshes (review S4)", async () => {
    // The newer turn (from another tab) has answered by the time this tab refreshes.
    mockFetch({
      ...states(empty, answered),
      "POST /api/analysis/messages": {
        status: 409,
        body: { code: "turn_superseded", message: "x" },
      },
    });
    const u = userEvent.setup();
    render(<Workspace onSessionEnded={() => {}} {...fast} />);
    const input = await screen.findByRole("textbox", { name: "Ask a question" });
    await u.type(input, "hello");
    await u.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(DROPPED);
    expect(screen.queryByText(STILL)).not.toBeInTheDocument();
    expect(input).toHaveValue("hello");
    const log = await screen.findByRole("list", { name: "Conversation" });
    expect(within(log).getByText("Showing 2 of 87 customers…")).toBeInTheDocument();
  });

  it("stops waiting after the turn deadline and offers a retry", async () => {
    const fetchMock = mockFetch(states({ ...empty, turnInProgress: true }));
    const { container } = render(
      <Workspace onSessionEnded={() => {}} pollIntervalMs={10} turnDeadlineMs={60} />,
    );
    expect(
      await screen.findByText("This is taking longer than expected. Try again in a moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText(STILL)).not.toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
