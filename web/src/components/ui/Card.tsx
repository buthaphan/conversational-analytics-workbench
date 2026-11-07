import { type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

export interface CardProps {
  /** Optional heading; also labels the card as a region. */
  title?: string;
  headingLevel?: 2 | 3 | 4;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, headingLevel = 3, footer, children, className }: CardProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const headingSize = headingLevel === 2 ? "text-h2" : "text-h3";

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn(
        "flex flex-col rounded-lg border border-border bg-surface text-fg shadow-sm",
        className,
      )}
    >
      {title && (
        <header className="px-5 pt-5">
          <Heading id={headingId} className={headingSize}>
            {title}
          </Heading>
        </header>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <footer className="border-t border-border px-5 py-3 text-body-sm text-fg-secondary">
          {footer}
        </footer>
      )}
    </section>
  );
}
