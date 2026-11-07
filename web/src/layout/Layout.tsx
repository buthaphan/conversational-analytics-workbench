import type { ReactNode } from "react";
import logoUrl from "../logo.svg";

export interface LayoutProps {
  /** Shown at the end of the header, for example the signed-in user and Sign out. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Page frame: header with logo and product name, then the main content. */
export function Layout({ actions, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <img src={logoUrl} alt="" className="h-8 w-auto" />
          <h1 className="text-h3 text-fg">Conversational Analytics Workbench</h1>
          {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
