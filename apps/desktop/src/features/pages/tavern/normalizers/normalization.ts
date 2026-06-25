export const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

export const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
  : [];

export const normalizeStringList = (value: unknown, maxItems = 12) => Array.isArray(value)
  ? [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
      .slice(0, maxItems)
  : [];

export const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => {
        const valueText = typeof item === "string" ? item : "";
        return key && valueText ? [[key, valueText]] : [];
      }),
  );
};
