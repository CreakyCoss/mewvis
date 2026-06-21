import type {
  TavernMessage,
  TavernRoom,
} from "../../../types";
import type { QuickNovelExportFormat } from "./types";

export const sanitizeFileName = (value: string) =>
  value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "tavern-room";

export const formatQuickSummaryGeneratedAt = (generatedAt?: number) => (
  generatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(generatedAt)
    : ""
);

export const createQuickNovelExportContent = ({
  format,
  roomTitle,
  sceneTitle,
  generatedAt,
  content,
}: {
  format: QuickNovelExportFormat;
  roomTitle: string;
  sceneTitle: string;
  generatedAt: number | undefined;
  content: string;
}) => {
  const trimmedContent = content.trim();
  if (format === "txt") {
    return `${trimmedContent}\n`;
  }

  const generatedAtText = generatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(generatedAt)
    : "";
  const metadataLines = [
    sceneTitle ? `场景：${sceneTitle}` : "",
    generatedAtText ? `生成时间：${generatedAtText}` : "",
  ].filter(Boolean);

  return [
    `# ${roomTitle}`,
    "",
    ...metadataLines,
    "",
    "---",
    "",
    trimmedContent,
    "",
  ].join("\n");
};

export const createQuickSummarySignature = (
  room: TavernRoom,
  messages: TavernMessage[],
) => JSON.stringify({
  roomId: room.id,
  activeSceneId: room.activeSceneId ?? "",
  updatedAt: room.updatedAt,
  title: room.title,
  storyOutline: room.storyOutline,
  storyGoal: room.storyGoal,
  scene: room.scene,
  sceneGoal: room.sceneGoal,
  scenePlot: room.scenePlot,
  sceneDirection: room.sceneDirection,
  sceneTransition: room.sceneTransition,
  storyGraph: room.storyGraph,
  memory: room.memory,
  characterIds: room.characterIds,
  activeCharacterId: room.activeCharacterId,
  replyMode: room.replyMode,
  characterMemories: room.characterMemories,
  lorebookEntries: room.lorebookEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    keywords: entry.keywords,
    enabled: entry.enabled,
    alwaysOn: entry.alwaysOn,
    updatedAt: entry.updatedAt,
  })),
  messages: messages.map((message) => ({
    id: message.id,
    role: message.role,
    characterId: message.characterId ?? "",
    content: message.content,
    status: message.status ?? "",
    referencedFiles: message.referencedFiles ?? [],
  })),
});
