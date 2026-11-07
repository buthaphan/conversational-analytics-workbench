import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const buttonClasses = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap",
    "transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-disabled:cursor-progress",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border border-border-input bg-surface text-fg hover:bg-surface-muted",
        ghost: "bg-transparent text-primary hover:bg-surface-muted",
        destructive: "bg-destructive text-on-destructive hover:bg-destructive-hover",
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-10 px-4 text-body",
      },
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy`, and ignores activation while keeping focus. */
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  className,
  onClick,
  children,
  "aria-busy": ariaBusy,
  "aria-disabled": ariaDisabled,
  ...props
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    // Caller props are spread first so the loading semantics below cannot be overridden.
    <button
      {...props}
      type={type}
      data-variant={variant}
      aria-busy={loading ? true : ariaBusy}
      aria-disabled={loading ? true : ariaDisabled}
      className={cn(buttonClasses({ variant, size }), className)}
      onClick={handleClick}
    >
      {loading && <Spinner decorative />}
      {children}
    </button>
  );
}
