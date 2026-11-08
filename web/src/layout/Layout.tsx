import type { ReactNode } from "react";
import logoUrl from "../logo-on-dark.svg";

export interface LayoutProps {
  /** Shown at the end of the header, for example the signed-in user and Sign out. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Page frame: a brand navy header with the logo and the actions, then the main content. The logo
 * already shows the product name, so it is the page heading itself (TASK-004 DEC-004).
 */
export function Layout({ actions, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="bg-brand-navy text-on-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <h1>
            <img
              src={logoUrl}
              alt="Conversational Analytics Workbench"
              className="h-12 w-auto sm:h-16"
            />
          </h1>
          {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
