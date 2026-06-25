export const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const stringArrayValue = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => {
      const text = trimText(item);
      return text ? [text] : [];
    })
  : [];

export const recordArrayValue = (value: unknown) => Array.isArray(value)
  ? value.filter(isRecord)
  : [];

export const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = trimText(value);
    if (text) {
      return text;
    }
  }

  return "";
};

export const joinSections = (
  sections: Array<[string, unknown]>,
) => sections.flatMap(([label, value]) => {
  const text = trimText(value);
  return text ? [`${label}：\n${text}`] : [];
}).join("\n\n");

export const parseJsonObject = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  return parsed;
};
