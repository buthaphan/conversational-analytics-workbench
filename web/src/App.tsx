import { lazy, Suspense } from "react";
import { Spinner } from "./components/ui/Spinner";
import logoUrl from "./logo.svg";

// Development only: Vite replaces import.meta.env.DEV with false in production builds,
// so the reference page and its import are removed from the bundle (checked by check:build).
const ReferencePage = import.meta.env.DEV
  ? lazy(() => import("./reference/ReferencePage").then((m) => ({ default: m.ReferencePage })))
  : null;

export function App() {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <img src={logoUrl} alt="" className="h-8 w-auto" />
          <h1 className="text-h3 text-fg">Conversational Analytics Workbench</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {ReferencePage ? (
          <Suspense fallback={<Spinner label="Loading design reference" />}>
            <ReferencePage />
          </Suspense>
        ) : (
          <p className="text-body text-fg-secondary">The analytics workspace is coming soon.</p>
        )}
      </main>
    </div>
  );
}
