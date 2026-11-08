/**
 * The reference money rules (TASK-003 TD-12), shared by every data source: each item is rounded to
 * whole cents, cents are summed, and a result is rounded half up to 2 decimals.
 */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => Math.round(cents) / 100;
