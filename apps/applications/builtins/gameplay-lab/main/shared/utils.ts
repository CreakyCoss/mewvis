export const uid = (prefix = "item") => `${prefix}-${crypto.randomUUID()}`;
export const copy = <T>(value: T): T => structuredClone(value);
