import { cn } from "../../lib/cn";

export interface SpinnerProps {
  /** Announced text; ignored when `decorative`. */
  label?: string;
  /** Hide from assistive technology, e.g. inside a button that already sets `aria-busy`. */
  decorative?: boolean;
  className?: string;
}

export function Spinner({ label = "Loading", decorative = false, className }: SpinnerProps) {
  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0 motion-safe:animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  if (decorative) {
    return <span aria-hidden="true">{icon}</span>;
  }

  return (
    <span role="status" aria-label={label} className="inline-flex">
      {icon}
    </span>
  );
}
