import type { KnowledgeErrorCode } from "./contracts.js";
import { KnowledgeError } from "./errors.js";

export type ValidationCode = Extract<
  KnowledgeErrorCode,
  "INVALID_ARGUMENT" | "INVALID_RESPONSE"
>;
export interface Rule {
  readonly optional?: boolean;
  check(value: unknown, path: string, code: ValidationCode): void;
}
export function invalid(code: ValidationCode, path: string): never {
  throw new KnowledgeError({
    code,
    message: `Invalid knowledge value at ${path}`,
  });
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Snapshot before crossing the boundary: no getters, cycles, classes or lossy JSON coercion. */
export function copyJson(value: unknown, code: ValidationCode): unknown {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 64) invalid(code, "json.limits");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || item === null) invalid(code, "json");
    const array = Array.isArray(item);
    const proto = Object.getPrototypeOf(item);
    if (!(array ? [Array.prototype] : [Object.prototype, null]).includes(proto))
      invalid(code, "json.prototype");
    if (ancestors.has(item)) invalid(code, "json.cycle");
    ancestors.add(item);
    const keys = Reflect.ownKeys(item).filter(
      (key) => !array || key !== "length",
    );
    if (array && keys.length !== item.length) invalid(code, "json.array");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length))
      )
        invalid(code, "json.property");
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  return JSON.parse(JSON.stringify(value)) as unknown;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
const primitive = (test: (value: unknown) => boolean): Rule => ({
  check(value, path, code) {
    if (!test(value)) invalid(code, path);
  },
});
export const string = primitive((value) => typeof value === "string");
export const text = primitive(
  (value) => typeof value === "string" && value.trim().length > 0,
);
export const boolean = primitive((value) => typeof value === "boolean");
export const finite = primitive(
  (value) => typeof value === "number" && Number.isFinite(value),
);
export const natural = primitive(
  (value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
);
export const positive = primitive(
  (value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0,
);
export const timestamp = primitive(
  (value) =>
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value,
);
export const metadata = primitive(isRecord); // copyJson has already validated every nested value.
export const optional = (rule: Rule): Rule => ({ ...rule, optional: true });
export const nullable = (rule: Rule): Rule => ({
  check(value, path, code) {
    if (value !== null) rule.check(value, path, code);
  },
});
export const literal = (value: string | number | boolean): Rule =>
  primitive((item) => item === value);
export const enumeration = (values: readonly string[]): Rule =>
  primitive((value) => typeof value === "string" && values.includes(value));
export const array = (item: Rule, min = 0, unique = false): Rule => ({
  check(value, path, code) {
    if (
      !Array.isArray(value) ||
      value.length < min ||
      (unique && new Set(value).size !== value.length)
    )
      invalid(code, path);
    value.forEach((entry, index) =>
      item.check(entry, `${path}[${index}]`, code),
    );
  },
});
export const object = (
  fields: Readonly<Record<string, Rule>>,
  allowUnknown = false,
): Rule => ({
  check(value, path, code) {
    if (!isRecord(value)) invalid(code, path);
    if (
      !allowUnknown &&
      Object.keys(value).some((key) => !Object.hasOwn(fields, key))
    )
      invalid(code, `${path}.fields`);
    for (const [key, rule] of Object.entries(fields)) {
      if (!Object.hasOwn(value, key)) {
        if (!rule.optional) invalid(code, `${path}.${key}`);
      } else rule.check(value[key], `${path}.${key}`, code);
    }
  },
});
export const union = (...rules: Rule[]): Rule => ({
  check(value, path, code) {
    for (const rule of rules) {
      try {
        rule.check(value, path, code);
        return;
      } catch (error) {
        if (!(error instanceof KnowledgeError)) throw error;
      }
    }
    invalid(code, path);
  },
});
export const refine = (rule: Rule, test: (value: any) => boolean): Rule => ({
  check(value, path, code) {
    rule.check(value, path, code);
    if (!test(value)) invalid(code, path);
  },
});
