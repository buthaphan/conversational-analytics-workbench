import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/axe";
import { mockFetch } from "../test/fetch";
import { SignInScreen } from "./SignInScreen";

const user = { email: "user@example.test" };

function renderScreen(props: Partial<Parameters<typeof SignInScreen>[0]> = {}) {
  const onSignedIn = vi.fn();
  const result = render(<SignInScreen onSignedIn={onSignedIn} {...props} />);
  return { ...result, onSignedIn };
}

async function fillAndSubmit(email = "user@example.test", password = "123456") {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText(/^Email/), email);
  await u.type(screen.getByLabelText(/^Password/), password);
  await u.click(screen.getByRole("button", { name: "Sign in" }));
  return u;
}

describe("SignInScreen (AC-13)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has labelled email and password fields with autocomplete hints, and no axe violations", async () => {
    const { container } = renderScreen();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    const email = screen.getByLabelText(/^Email/);
    const password = screen.getByLabelText(/^Password/);
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await expectNoAxeViolations(container);
  });

  it("shows field errors for empty fields without sending a request, and focuses the first", async () => {
    const fetchMock = mockFetch({});
    const { container } = renderScreen();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription("Enter your email.");
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription("Enter your password.");
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("signs in and reports the user", async () => {
    mockFetch({ "POST /api/auth/sign-in": { status: 200, body: { user } } });
    const { onSignedIn } = renderScreen();
    await fillAndSubmit();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(user));
  });

  it("shows loading while signing in and ignores repeat submits", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({ user }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();
    const u = await fillAndSubmit();
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await u.click(button);
    await u.keyboard("{Enter}");
    release();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy", "true"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "Email or password is incorrect."],
    [429, "Too many sign-in attempts. Try again later."],
    [500, "Something went wrong. Try again."],
  ])("shows the message for a %i response and moves focus to it", async (status, message) => {
    mockFetch({ "POST /api/auth/sign-in": { status, body: { message: "server text" } } });
    const { container, onSignedIn } = renderScreen();
    await fillAndSubmit();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert.closest("[tabindex='-1']")).toHaveFocus());
    expect(onSignedIn).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("shows a network error when the server cannot be reached", async () => {
    mockFetch({ "POST /api/auth/sign-in": "network-error" });
    renderScreen();
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Try again.",
    );
  });

  it.each([
    ["session-ended", "Your session has ended. Sign in again."],
    ["signed-out", "You have signed out."],
  ] as const)("shows the %s notice as a status message", async (notice, message) => {
    const { container } = renderScreen({ notice });
    expect(screen.getByRole("status")).toHaveTextContent(message);
    await expectNoAxeViolations(container);
  });
});
