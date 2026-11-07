import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type AlertVariant = "info" | "success" | "warning" | "error";

// Full class names are listed so Tailwind can find them in source.
const STYLES: Record<AlertVariant, { box: string; icon: string; label: string; path: string }> = {
  info: {
    box: "border-info-border bg-info-subtle",
    icon: "text-info",
    label: "Information",
    path: "M10 9v5M10 6h.01",
  },
  success: {
    box: "border-success-border bg-success-subtle",
    icon: "text-success",
    label: "Success",
    path: "M6.5 10.5l2.5 2.5 4.5-5",
  },
  warning: {
    box: "border-warning-border bg-warning-subtle",
    icon: "text-warning",
    label: "Warning",
    path: "M10 6v5M10 14h.01",
  },
  error: {
    box: "border-error-border bg-error-subtle",
    icon: "text-error",
    label: "Error",
    path: "M7.5 7.5l5 5M12.5 7.5l-5 5",
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Inline message. Error and warning use role="alert" (announced immediately when they appear
 * after an action); info and success use role="status" (announced politely).
 */
export function Alert({ variant = "info", title, children, className }: AlertProps) {
  const style = STYLES[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn("flex gap-3 rounded-md border p-4 text-body-sm text-fg", style.box, className)}
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className={cn("mt-0.5 size-5 shrink-0", style.icon)}
      >
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d={style.path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col gap-1">
        {title ? (
          <p className="font-semibold">
            <span className="sr-only">{style.label}: </span>
            {title}
          </p>
        ) : (
          <span className="sr-only">{style.label}: </span>
        )}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
