import { fromCents, toCentsOrNull } from "./money";

export function dollarsFromCentsOrNumber(
  cents: number | null | undefined,
  dollars: number | null | undefined,
): number {
  if (isFiniteNumber(cents)) return fromCents(cents);
  if (isFiniteNumber(dollars)) return dollars;
  return 0;
}

export function dollarsFromCentsOrNumberOrNull(
  cents: number | null | undefined,
  dollars: number | null | undefined,
): number | null {
  if (isFiniteNumber(cents)) return fromCents(cents);
  if (isFiniteNumber(dollars)) return dollars;
  return null;
}

export function toCentsOrUndefined(
  dollars: number | null | undefined,
): number | undefined {
  if (dollars === undefined) return undefined;
  return toCentsOrNull(dollars) ?? undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
