import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/ui/FormField";
import { Input } from "../components/ui/Input";
import { type SignInError, type User, signIn } from "./api";

/** Why the sign-in screen is showing, when it is not the first visit. */
export type SignInNotice = "session-ended" | "signed-out" | "network";

const ERROR_MESSAGES: Record<SignInError, string> = {
  invalid: "Email or password is incorrect.",
  "rate-limited": "Too many sign-in attempts. Try again later.",
  network: "Could not reach the server. Try again.",
  unexpected: "Something went wrong. Try again.",
};

export interface SignInScreenProps {
  notice?: SignInNotice;
  onSignedIn: (user: User) => void;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

/** Sign-in form (AC-13), built only from design-system components. */
export function SignInScreen({ notice, onSignedIn }: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<SignInError | null>(notice === "network" ? "network" : null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Move focus to what needs attention: the server error, or the first invalid field.
  useEffect(() => {
    if (attempt === 0) return;
    if (error) {
      errorRef.current?.focus();
    } else {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [attempt, error, fieldErrors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    setError(null);
    if (errors.email || errors.password) {
      setAttempt((n) => n + 1);
      return;
    }

    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.ok) {
      onSignedIn(result.user);
      return;
    }
    setError(result.error);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      {notice === "session-ended" && (
        <Alert variant="info">Your session has ended. Sign in again.</Alert>
      )}
      {notice === "signed-out" && <Alert variant="success">You have signed out.</Alert>}
      <Card title="Sign in" headingLevel={2}>
        <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Alert variant="error">{ERROR_MESSAGES[error]}</Alert>
            </div>
          )}
          <FormField label="Email" required error={fieldErrors.email}>
            {(field) => (
              <Input
                {...field}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Password" required error={fieldErrors.password}>
            {(field) => (
              <Input
                {...field}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" loading={submitting}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
