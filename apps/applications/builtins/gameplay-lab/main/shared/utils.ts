export const uid = (prefix = "item") => `${prefix}-${crypto.randomUUID()}`;
export const copy = <T>(value: T): T => structuredClone(value);

export const isNumber = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= 1_000_000;
