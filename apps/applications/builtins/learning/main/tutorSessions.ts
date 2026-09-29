import type { ApplicationChatSummary } from "@isle/app-sdk/chat";

export type TutorSessionIndex = {
  workspaceId: string;
  chatId: string;
  sessionIds: string[];
};

export const tutorSessionKey = (courseId: string, lessonId: string) =>
  `learning:tutor:${courseId}:${lessonId}`;

export function readTutorSessionIndex(value: unknown): TutorSessionIndex | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.workspaceId !== "string" || !record.workspaceId ||
    typeof record.chatId !== "string" || !record.chatId
  )
    return null;
  const sessionIds = Array.isArray(record.sessionIds)
    ? record.sessionIds.filter((id): id is string => typeof id === "string" && !!id)
    : [];
  return {
    workspaceId: record.workspaceId,
    chatId: record.chatId,
    sessionIds: [...new Set([...sessionIds, record.chatId])],
  };
}

export function activateTutorSession(
  index: TutorSessionIndex | null,
  workspaceId: string,
  chatId: string,
): TutorSessionIndex {
  return {
    workspaceId,
    chatId,
    sessionIds: [...new Set([
      ...(index?.workspaceId === workspaceId ? index.sessionIds : []),
      chatId,
    ])],
  };
}

export function tutorSessionHistory(
  index: TutorSessionIndex | null,
  summaries: ApplicationChatSummary[],
): ApplicationChatSummary[] {
  if (!index) return [];
  const ids = new Set(index.sessionIds);
  return summaries
    .filter((item) => item.sceneId === "learning-tutor" && ids.has(item.chatId))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}
