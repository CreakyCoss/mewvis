import type {
  TavernGeneratedPresetJson,
} from "./types";

const firstJsonObjectFromText = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
};

export const parseTavernGeneratedPresetJsonText = (
  text: string,
): TavernGeneratedPresetJson => {
  const trimmed = text.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : firstJsonObjectFromText(trimmed);
  if (!jsonText) {
    throw new Error("未找到可导入的酒馆 JSON 对象");
  }

  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("酒馆生成结果必须是 JSON 对象");
  }

  return parsed as TavernGeneratedPresetJson;
};
