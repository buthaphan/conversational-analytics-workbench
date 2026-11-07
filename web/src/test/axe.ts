import { expect } from "vitest";
import { axe } from "vitest-axe";

/**
 * Asserts axe finds no accessibility violations.
 *
 * The `color-contrast` rule is disabled here only: the simulated DOM has no layout or canvas, so
 * axe cannot compute contrast (it returns "incomplete" and logs canvas errors). Contrast is
 * verified instead by the token pairing tests (AC-3) and the manual check (AC-9).
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
