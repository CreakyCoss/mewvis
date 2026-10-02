import type { ApplicationStorage, ApplicationStorageValue } from "@mewvis/app-sdk/data";
import { object, text, validId } from "./course";

export type AssistantOutcome = "accepted" | "viewed" | "discarded" | "revised" | "retried";
export type AssistantPreviewSummary = {
  title?: string;
  body: string;
  detail?: string;
  items?: string[];
};
export type AssistantTurn = {
  id: string;
  context: string;
  request: string;
  outcome: AssistantOutcome;
  preview?: AssistantPreviewSummary;
  error?: string;
};

const outcomes = new Set<AssistantOutcome>([
  "accepted", "viewed", "discarded", "revised", "retried",
]);
const maxHistoryBytes = 180_000;
export const assistantHistoryKey = (courseId: string) => `learning:assistant:${validId(courseId)}`;

export function validateAssistantHistory(value: unknown): AssistantTurn[] {
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("AI 对话记录格式无效");
  const turns = value.map((entry): AssistantTurn => {
    const row = object(entry, "AI 对话");
    if (!outcomes.has(row.outcome as AssistantOutcome))
      throw new Error("AI 对话状态无效");
    let preview: AssistantPreviewSummary | undefined;
    if (row.preview !== undefined) {
      const detail = object(row.preview, "AI 结果预览");
      if (detail.items !== undefined && (!Array.isArray(detail.items) || detail.items.length > 6))
        throw new Error("AI 结果预览格式无效");
      preview = {
        body: text(detail.body, "AI 结果摘要", 3000),
        ...(detail.title !== undefined ? { title: text(detail.title, "AI 结果标题", 1000) } : {}),
        ...(detail.detail !== undefined ? { detail: text(detail.detail, "AI 结果补充", 1000) } : {}),
        ...(detail.items !== undefined
          ? { items: detail.items.map((item) => text(item, "AI 结果条目", 200)) }
          : {}),
      };
    }
    return {
      id: validId(row.id),
      context: text(row.context, "AI 对话环节", 200),
      request: text(row.request, "AI 对话要求", 500),
      outcome: row.outcome as AssistantOutcome,
      ...(preview ? { preview } : {}),
      ...(row.error !== undefined ? { error: text(row.error, "AI 对话错误", 500) } : {}),
    };
  });
  if (new TextEncoder().encode(JSON.stringify(turns)).byteLength > maxHistoryBytes)
    throw new Error("AI 对话记录超过 180 KB，请减少对话内容后重试");
  return turns;
}

export async function readAssistantHistory(storage: ApplicationStorage, courseId: string) {
  return validateAssistantHistory(await storage.getItem(assistantHistoryKey(courseId)));
}

export async function writeAssistantHistory(
  storage: ApplicationStorage,
  courseId: string,
  history: AssistantTurn[],
) {
  if (!history.length) return;
  await storage.setItem(
    assistantHistoryKey(courseId),
    validateAssistantHistory(history) as unknown as ApplicationStorageValue,
  );
}
