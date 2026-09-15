import { optionalString, ServiceError } from "../../shared/validation.js";

export function nullableText(value: unknown, label: string): string | null {
  return optionalString(value, label) ?? null;
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new ServiceError(400, "INVALID_ARGUMENT", `${label} 必须是布尔值`);
  return value;
}

export function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value))
    throw new ServiceError(400, "INVALID_ARGUMENT", `${label} 必须是数组`);
  return value;
}
