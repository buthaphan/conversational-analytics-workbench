/** Browser client for the auth API. Same-origin requests; the session cookie is HttpOnly. */

export interface User {
  email: string;
}

export type SessionResult =
  | { status: "signed-in"; user: User }
  | { status: "signed-out" }
  | { status: "error"; error: "network" | "unexpected" };

export type SignInError = "invalid" | "rate-limited" | "network" | "unexpected";
export type SignInResult = { ok: true; user: User } | { ok: false; error: SignInError };

const base: RequestInit = { credentials: "same-origin" };

async function request(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(path, { ...base, ...init });
  } catch {
    return null;
  }
}

/** Current session. Also the keep-alive: each call counts as activity on the server. */
export async function getSession(): Promise<SessionResult> {
  const response = await request("/api/auth/session");
  if (!response) return { status: "error", error: "network" };
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "error", error: "unexpected" };
  const { user } = (await response.json()) as { user: User };
  return { status: "signed-in", user };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const response = await request("/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response) return { ok: false, error: "network" };
  if (response.ok) {
    const { user } = (await response.json()) as { user: User };
    return { ok: true, user };
  }
  // 400 means the server rejected the input shape; show the same generic message as a wrong password.
  if (response.status === 401 || response.status === 400) return { ok: false, error: "invalid" };
  if (response.status === 429) return { ok: false, error: "rate-limited" };
  return { ok: false, error: "unexpected" };
}

/** Ends the session. Returns false only when the server could not be reached or failed. */
export async function signOut(): Promise<boolean> {
  const response = await request("/api/auth/sign-out", { method: "POST" });
  return response !== null && response.ok;
}
