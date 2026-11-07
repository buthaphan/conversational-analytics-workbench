import { lazy, Suspense } from "react";
import { AuthApp } from "./auth/AuthApp";
import { Spinner } from "./components/ui/Spinner";
import { Layout } from "./layout/Layout";

/** Path of the development-only design reference page (TASK-002; moved here in TASK-001 AC-15). */
export const DESIGN_REFERENCE_PATH = "/design-reference";

// Development only: Vite replaces import.meta.env.DEV with false in production builds,
// so the reference page and its import are removed from the bundle (checked by check:build).
const ReferencePage = import.meta.env.DEV
  ? lazy(() => import("./reference/ReferencePage").then((m) => ({ default: m.ReferencePage })))
  : null;

export function App() {
  if (ReferencePage && window.location.pathname === DESIGN_REFERENCE_PATH) {
    return (
      <Layout>
        <Suspense fallback={<Spinner label="Loading design reference" />}>
          <ReferencePage />
        </Suspense>
      </Layout>
    );
  }
  return <AuthApp />;
}
