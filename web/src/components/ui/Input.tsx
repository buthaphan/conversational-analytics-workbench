import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

/** Text input. Use inside `FormField`, which supplies the id, ARIA wiring, and invalid state. */
export function Input({ className, ...props }: InputProps) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <input
      className={cn(
        "block h-10 w-full rounded-md border bg-surface px-3 text-body text-fg",
        // A smaller, fainter hint than the typed text.
        "placeholder:text-body-sm placeholder:text-fg-placeholder",
        // Focus darkens the border and thickens it to 2px (an inset ring), instead of an outline
        // ring around the field. Both border colors meet 3:1 against the surface (tested pairings).
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        invalid
          ? "border-error focus-visible:ring-error"
          : "border-border-input focus-visible:border-fg-secondary focus-visible:ring-fg-secondary",
        className,
      )}
      {...props}
    />
  );
}
