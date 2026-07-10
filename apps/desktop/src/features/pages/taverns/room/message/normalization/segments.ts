import type { MessageActorRef, MessagePresentationConfig, MessageRole, MessageSegment } from "../types";
import { buildDialogueAndActionSegments, normalizeActionText } from "./actions";

type MessageSegmentBuildInput = {
  role: MessageRole;
  characterId?: string;
  content: string;
  actions?: string[];
  thought?: string;
  presentation?: MessagePresentationConfig;
};

export const buildMessageSegments = ({
  role,
  characterId,
  content,
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
    if (role === "narrator") {
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
      segments.push(
        ...buildDialogueAndActionSegments({
          actor,
          content: trimmedContent,
        }),
      );
    }
  }

  const explicitActionTexts = (actions ?? []).map((action) => normalizeActionText(action, true)).filter(Boolean);
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
