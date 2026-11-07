import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Text input. Use inside `FormField`, which supplies the id, ARIA wiring, and invalid state. */
export function Input({ className, ...props }: InputProps) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <input
      className={cn(
        "block h-10 w-full rounded-md border bg-surface px-3 text-body text-fg",
        "placeholder:text-fg-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        invalid ? "border-error" : "border-border-input",
        className,
      )}
      {...props}
    />
  );
}
