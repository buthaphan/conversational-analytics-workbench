import { type ComponentType, useCallback, useEffect, useRef, useState } from "react";
import { Workspace } from "../analysis/Workspace";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { Layout } from "../layout/Layout";
import { type User, getSession, signOut } from "./api";
import { type SignInNotice, SignInScreen } from "./SignInScreen";

/**
 * Keep-alive interval. Browsers throttle hidden-tab timers to about once a minute, so 2 minutes stays
 * well inside the 10-minute inactivity timeout (DEC-002).
 */
export const KEEP_ALIVE_MS = 2 * 60 * 1000;

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; notice?: SignInNotice }
  | { kind: "signed-in"; user: User };

export interface AuthAppProps {
  /** The signed-in content; tests replace it. `onSessionEnded` returns to sign-in (TASK-003 AC-13). */
  workspace?: ComponentType<{ onSessionEnded: () => void }>;
}

/** Session-aware app: sign-in screen or signed-in shell (AC-13, AC-14). */
export function AuthApp({ workspace: SignedInWorkspace = Workspace }: AuthAppProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getSession().then((result) => {
      if (!active) return;
      if (result.status === "signed-in") setState({ kind: "signed-in", user: result.user });
      else if (result.status === "signed-out") setState({ kind: "signed-out" });
      else setState({ kind: "signed-out", notice: "network" });
    });
    return () => {
      active = false;
    };
  }, []);

  const signedIn = state.kind === "signed-in";
  // Changes on every sign-in and sign-out, so a keep-alive answer from an earlier state is ignored
  // (review R5): a late 401 must not overwrite "You have signed out." or sign out a new session.
  const sessionGeneration = useRef(0);
  const enterState = useCallback((next: State) => {
    sessionGeneration.current += 1;
    // Sign-out progress and errors from an earlier state never carry over to a new one (review N1, N3).
    setSignOutFailed(false);
    setSigningOut(false);
    setState(next);
  }, []);

  const keepAlive = useCallback(async () => {
    const generation = sessionGeneration.current;
    const result = await getSession();
    if (generation !== sessionGeneration.current) return;
    // A network blip is not a sign-out; the next keep-alive tries again.
    if (result.status === "signed-out") {
      enterState({ kind: "signed-out", notice: "session-ended" });
    }
  }, [enterState]);

  useEffect(() => {
    if (!signedIn) return;
    const timer = setInterval(() => void keepAlive(), KEEP_ALIVE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, keepAlive]);

  const handleSessionEnded = useCallback(
    () => enterState({ kind: "signed-out", notice: "session-ended" }),
    [enterState],
  );

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutFailed(false);
    const generation = sessionGeneration.current;
    const ok = await signOut();
    setSigningOut(false);
    // The app has moved on (session ended or a new sign-in) while this reply was in flight (review N2).
    if (generation !== sessionGeneration.current) return;
    if (ok) enterState({ kind: "signed-out", notice: "signed-out" });
    else setSignOutFailed(true);
  }

  if (state.kind === "loading") {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Spinner label="Checking your session" className="size-6 text-fg-secondary" />
        </div>
      </Layout>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <Layout>
        <SignInScreen
          notice={state.notice}
          onSignedIn={(user) => enterState({ kind: "signed-in", user })}
        />
      </Layout>
    );
  }

  return (
    <Layout
      actions={
        <>
          <span className="flex items-center gap-2 text-body-sm">
            <Icon name="user" className="size-5 text-on-brand-accent" />
            <span className="text-on-brand-accent">{state.user.email}</span>
          </span>
          {/* On the navy header the default teal focus ring is too faint (TASK-004 DEC-004).
              Outlined in white on the navy, like the header text (tested pairing). */}
          <Button
            variant="ghost"
            size="sm"
            loading={signingOut}
            onClick={handleSignOut}
            className="border border-on-primary text-on-primary hover:bg-primary-hover focus-visible:outline-on-primary"
          >
            Sign out
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {signOutFailed && <Alert variant="error">Could not sign out. Try again.</Alert>}
        <SignedInWorkspace onSessionEnded={handleSessionEnded} />
      </div>
    </Layout>
  );
}
