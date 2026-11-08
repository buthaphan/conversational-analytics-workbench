import { type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

export interface CardProps {
  /** Optional heading; also labels the card as a region. */
  title?: string;
  headingLevel?: 2 | 3 | 4;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Smaller heading size and tighter padding; the heading level is unchanged. */
  compact?: boolean;
  /** The body is a flex column that fills the card's height, e.g. when the card is stretched. */
  stretch?: boolean;
}

export function Card({
  title,
  headingLevel = 3,
  footer,
  children,
  className,
  compact = false,
  stretch = false,
}: CardProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const headingSize = headingLevel === 2 && !compact ? "text-h2" : "text-h3";

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn(
        "flex flex-col rounded-lg border border-border bg-surface text-fg shadow-sm",
        className,
      )}
    >
      {title && (
        <header className={compact ? "px-4 pt-3" : "px-5 pt-5"}>
          <Heading id={headingId} className={headingSize}>
            {title}
          </Heading>
        </header>
      )}
      <div
        className={cn(
          compact ? "px-4 pt-2 pb-3" : "p-5",
          stretch && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
      {footer && (
        <footer className="border-t border-border px-5 py-3 text-body-sm text-fg-secondary">
          {footer}
        </footer>
      )}
    </section>
  );
}
