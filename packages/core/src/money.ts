export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("amount must be a finite number");
  }
  const sign = Math.sign(amount);
  return sign * Math.round(Math.abs(amount) * 100);
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new Error("cents must be a finite number");
  }
  return cents / 100;
}

export function toCentsOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return toCents(value);
}

export function fromCentsOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return fromCents(value);
}

export function sumCents(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    if (value == null) continue;
    if (!Number.isFinite(value)) {
      throw new Error("cents values must be finite numbers");
    }
    total += value;
  }
  return total;
}
