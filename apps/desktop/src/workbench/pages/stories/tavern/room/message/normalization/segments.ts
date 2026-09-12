import type { MessageActorRef, MessagePresentationConfig, MessageRole, MessageSegment } from "../types";

type MessageSegmentBuildInput = {
  role: MessageRole;
  characterId?: string;
  content: string;
  contentKind?: "default" | "narrative";
  actions?: string[];
  thought?: string;
  presentation?: MessagePresentationConfig;
};

export const buildMessageSegments = ({
  role,
  characterId,
  content,
  contentKind = "default",
  actions,
  thought,
  presentation,
}: MessageSegmentBuildInput): MessageSegment[] => {
  const actor = createActorForMessage({ role, characterId });
  const trimmedContent = content.trim();
  const segments: MessageSegment[] = [];
  const userInputMode = presentation?.userInputMode ?? "text";
  const isNarrativeCharacterMessage = role === "character" && presentation?.profileId === "novel-prose";

  if (trimmedContent) {
    if (contentKind === "narrative" || role === "narrator") {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else if (role === "user") {
      segments.push({
        type: userInputMode === "speech" ? "dialogue" : "text",
        ...(userInputMode === "speech" ? { speaker: actor } : {}),
        text: trimmedContent,
      } as MessageSegment);
    } else if (isNarrativeCharacterMessage) {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else {
      segments.push({
        type: "dialogue",
        speaker: actor,
        text: trimmedContent,
      });
    }
  }

  const explicitActionTexts = (actions ?? []).map((action) => action.trim()).filter(Boolean);
  for (const actionText of explicitActionTexts) {
    segments.push({
      type: "action",
      actor,
      text: actionText,
    });
  }

  const trimmedThought = thought?.trim();
  if (trimmedThought && role === "character") {
    segments.push({
      type: "thought",
      owner: actor,
      visibility: "private",
      text: trimmedThought,
    });
  }

  return segments;
};

const createActorForMessage = (message: { role: MessageRole; characterId?: string }): MessageActorRef => {
  if (message.role === "user") {
    return { type: "user" };
  }

  if (message.role === "character" && message.characterId) {
    return { type: "character", characterId: message.characterId };
  }

  return { type: "narrator" };
};
