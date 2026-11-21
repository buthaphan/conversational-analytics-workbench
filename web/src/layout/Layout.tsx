import type { ReactNode } from "react";
import { Icon } from "../components/ui/Icon";
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
      {/* Navy, deepening to the right; on-primary text passes on both ends (tested pairings). */}
      <header className="bg-brand-navy bg-linear-to-r from-brand-navy to-primary-hover text-on-primary shadow-md">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-[10%]">
          <h1>
            <img
              src={logoUrl}
              alt="Conversational Analytics Workbench"
              className="h-12 w-auto sm:h-14"
            />
          </h1>
          {/* The tagline as real text: inside the logo image it was too small to read. */}
          {/* The product promise, set as a pill with sparkles so it stands out on the navy. */}
          <p className="hidden items-center gap-2 rounded-full border border-on-brand-accent/40 bg-on-primary/5 px-4 py-1.5 text-body-sm font-semibold text-on-brand-accent md:flex">
            <Icon name="sparkle" className="size-4" />
            <span>Ask your data.</span>
            <Icon name="sparkle" className="size-3" />
            <span>See the evidence.</span>
          </p>
          {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 lg:px-[10%]">{children}</main>
    </div>
  );
}
