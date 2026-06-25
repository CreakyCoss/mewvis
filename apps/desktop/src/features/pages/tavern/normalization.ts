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
