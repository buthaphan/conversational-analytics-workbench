import { describe, expect, it } from "vitest";
import { formatDays, formatPeriod } from "./format";

describe("compact dates for series tables (TASK-005 walkthrough W3)", () => {
  it.each([
    ["2025-01-06", "2025-01-06", "6 Jan 2025"],
    ["2024-01-01", "2024-01-31", "1–31 Jan 2024"],
    ["2026-11-01", "2026-11-08", "1–8 Nov 2026"],
    ["2025-01-27", "2025-02-02", "27 Jan – 2 Feb 2025"],
    ["2024-12-30", "2025-01-05", "30 Dec 2024 – 5 Jan 2025"],
  ])("writes the days %s to %s as %s", (first, last, text) => {
    expect(formatDays(first, last)).toBe(text);
  });

  it.each([
    [{ start_date: "2025-01-01", end_date: "2026-01-01" }, "2025"],
    [{ start_date: "2023-01-01", end_date: "2025-01-01" }, "2023 – 2024"],
    [{ start_date: "2025-03-01", end_date: "2025-04-01" }, "Mar 2025"],
    [{ start_date: "2025-01-01", end_date: "2025-03-01" }, "Jan – Feb 2025"],
    [{ start_date: "2024-11-01", end_date: "2025-03-01" }, "Nov 2024 – Feb 2025"],
    [{ start_date: "2025-11-15", end_date: "2026-11-15" }, "15 Nov 2025 – 14 Nov 2026"],
    [{ start_date: "2025-03-03", end_date: "2025-03-10" }, "3–9 Mar 2025"],
  ])("names the period %j as %s", (scope, text) => {
    expect(formatPeriod(scope)).toBe(text);
  });
});
