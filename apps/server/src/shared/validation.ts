export type JsonObject = Record<string, unknown>;

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function object(value: unknown, label = "input"): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError(400, "INVALID_ARGUMENT", `${label} 必须是对象`);
  }
  return value as JsonObject;
}

export function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new ServiceError(400, "INVALID_ARGUMENT", `${label} 不能为空`);
  return value.trim();
}

export function optionalString(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string")
    throw new ServiceError(400, "INVALID_ARGUMENT", `${label} 必须是字符串`);
  return value.trim() || undefined;
}

export function onlyKeys(value: JsonObject, keys: readonly string[]) {
  const unexpected = Object.keys(value).find((key) => !keys.includes(key));
  if (unexpected)
    throw new ServiceError(400, "INVALID_ARGUMENT", `未知字段：${unexpected}`);
}

export function invalid(message: string): never {
  throw new ServiceError(400, "INVALID_ARGUMENT", message);
}
export function text(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(`${label} 必须是字符串`);
  return value;
}
