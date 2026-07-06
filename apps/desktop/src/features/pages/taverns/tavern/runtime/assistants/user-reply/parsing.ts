import type { TavernCharacter, TavernReplyOption, TavernRoom } from "@/features/pages/taverns/manage/model";

const replyOptionIntents = new Set<TavernReplyOption["intent"]>([
  "answer",
  "ask",
  "act",
  "interrupt",
  "wait",
  "inspect",
]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const stripUserLabel = (text: string, userPersonaName: string) => {
  const labels = [userPersonaName, "我", "用户", "玩家"]
    .map((label) => label.trim())
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");
  if (!labels) {
    return text.trim();
  }

  return text.replace(new RegExp(`^\\s*(?:${labels})\\s*[:：]\\s*`), "").trim();
};

const createReplyOptionId = (text: string, index: number) => {
  let hash = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(offset)) | 0;
  }

  return `reply-option-${index}-${Math.abs(hash).toString(36)}`;
};

const normalizeReplyOptionIntent = (value: unknown): TavernReplyOption["intent"] =>
  typeof value === "string" && replyOptionIntents.has(value as TavernReplyOption["intent"])
    ? (value as TavernReplyOption["intent"])
    : "ask";

const normalizeReplyOptionTargetCharacterIds = (value: unknown, characterIds: Set<string>) =>
  Array.isArray(value)
    ? [...new Set(value.flatMap((item) => (typeof item === "string" && characterIds.has(item) ? [item] : [])))]
    : [];

export const parseSuggestions = (
  text: string,
  {
    characters,
    room,
  }: {
    characters: TavernCharacter[];
    room: TavernRoom;
  },
): TavernReplyOption[] => {
  const characterIds = new Set(characters.map((character) => character.id));
  const pendingUserInteraction = room.pendingInteractions.find(
    (interaction) =>
      interaction.status === "open" && interaction.requiresResponse && interaction.target.type === "user",
  );
  const fallbackTargetCharacterIds =
    pendingUserInteraction?.source.type === "character" &&
    pendingUserInteraction.source.characterId &&
    characterIds.has(pendingUserInteraction.source.characterId)
      ? [pendingUserInteraction.source.characterId]
      : [];

  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    if (Array.isArray(parsed.replies)) {
      return parsed.replies.flatMap((item, index) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const rawText = typeof item === "string" ? item : typeof record.text === "string" ? record.text : "";
        const replyText = stripUserLabel(rawText, room.userPersonaName)
          .replace(/^["“”]+|["“”]+$/g, "")
          .trim();
        if (!replyText) {
          return [];
        }
        const targetCharacterIds = normalizeReplyOptionTargetCharacterIds(record.targetCharacterIds, characterIds);
        const respondsToInteractionId =
          typeof record.respondsToInteractionId === "string" &&
          room.pendingInteractions.some((interaction) => interaction.id === record.respondsToInteractionId)
            ? record.respondsToInteractionId
            : pendingUserInteraction?.id;

        return [
          {
            id: createReplyOptionId(replyText, index),
            text: replyText,
            ...(respondsToInteractionId ? { respondsToInteractionId } : {}),
            targetCharacterIds: targetCharacterIds.length > 0 ? targetCharacterIds : fallbackTargetCharacterIds,
            intent: normalizeReplyOptionIntent(record.intent),
          },
        ];
      });
    }
  } catch {
    // Fall through to the line parser for models that ignored the JSON instruction.
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, ""))
    .flatMap((replyText, index): TavernReplyOption[] => {
      const cleaned = stripUserLabel(replyText, room.userPersonaName)
        .replace(/^["“”]+|["“”]+$/g, "")
        .trim();

      return cleaned
        ? [
            {
              id: createReplyOptionId(cleaned, index),
              text: cleaned,
              ...(pendingUserInteraction?.id ? { respondsToInteractionId: pendingUserInteraction.id } : {}),
              targetCharacterIds: fallbackTargetCharacterIds,
              intent: "ask" as const,
            },
          ]
        : [];
    });
};

const toolCallArtifactPattern =
  /<\/?(?:function_calls?|tool_calls?|invoke|tool|arguments?|antml:function_calls?)[^>]*>/i;

const cleanManagedReply = (text: string, userPersonaName: string) => {
  const cleaned = stripUserLabel(text, userPersonaName)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

  if (
    toolCallArtifactPattern.test(cleaned) ||
    /^<[^>]+>\s*$/i.test(cleaned) ||
    /^(?:function_calls?|tool_calls?)\b/i.test(cleaned)
  ) {
    return "";
  }

  return cleaned;
};

export const parseManagedReply = (text: string, userPersonaName: string) => {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const candidates = [parsed.reply, parsed.userReply, parsed.user_reply, parsed.content, parsed.message, parsed.text];
    const reply = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    if (typeof reply === "string") {
      return cleanManagedReply(reply, userPersonaName);
    }

    if (Array.isArray(parsed.replies)) {
      const firstReply = parsed.replies.find((candidate) => typeof candidate === "string" && candidate.trim());
      if (typeof firstReply === "string") {
        return cleanManagedReply(firstReply, userPersonaName);
      }
    }
  } catch {
    // Fall through to plain-text parsing for models that ignored the JSON schema.
  }

  const trimmed = text.trim();
  if (!trimmed || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return "";
  }

  return cleanManagedReply(
    trimmed
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, ""))
      .find((line) => line.trim()) ?? "",
    userPersonaName,
  );
};

export const createManagedReplyFallback = (room: TavernRoom) =>
  room.sceneGoal.trim()
    ? `我先顺着当前目标继续推进：${room.sceneGoal.trim().slice(0, 80)}`
    : "我先顺着眼前的线索继续追问，看看还有没有被忽略的细节。";
