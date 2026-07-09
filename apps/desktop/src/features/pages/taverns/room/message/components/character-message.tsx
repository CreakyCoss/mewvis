import { Loader2 } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets/types";
import type { TavernMessageSegment } from "@/features/pages/taverns/tavern/types";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { stripTavernImmersiveDescriptionText } from "../protocol/tavern-cleanup";
import { formatTavernMessageSegmentsForDisplay } from "../domain/segments";
import { MessageControls } from "./message-controls";
import { MessageSegmentsContent } from "./message-segments-content";
import { formatTavernMessageTime } from "./message-time";

type CharacterMessageProps = {
  character?: TavernCharacter | null;
  content: string;
  createdAt: number;
  immersiveDescriptionEnabled: boolean;
  isError: boolean;
  isStreaming: boolean;
  segments: TavernMessageSegment[];
  thought?: string;
  visualPreset: VisualPresetDefinition;
};
export const CharacterMessage = ({
  character,
  content,
  createdAt,
  immersiveDescriptionEnabled,
  isError,
  isStreaming,
  segments,
  thought,
  visualPreset,
}: CharacterMessageProps) => {
  const avatar = resolveAvatar(character?.avatar);
  const displayThought = immersiveDescriptionEnabled ? (thought?.trim() ?? "") : "";
  const displaySegments = immersiveDescriptionEnabled
    ? segments.filter((segment) => segment.type !== "thought")
    : segments.filter((segment) => segment.type !== "thought" && segment.type !== "action");
  const segmentContent = formatTavernMessageSegmentsForDisplay(displaySegments, {
    includeThoughts: false,
  });
  const displayContent =
    segmentContent.trim() || (immersiveDescriptionEnabled ? content : stripTavernImmersiveDescriptionText(content));
  const copyContent = displayThought ? `心想：${displayThought}\n\n${displayContent}` : displayContent;

  if (!displayContent.trim() && !displayThought && !isError && !isStreaming) {
    return null;
  }

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <img src={avatar.src} alt="" className="size-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-current">
            <span className="font-medium">{character?.name ?? "角色"}</span>
            <span className="opacity-70">{formatTavernMessageTime(createdAt)}</span>
            {isStreaming && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div
            className={cn(
              "relative overflow-visible rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
              visualPreset.tavern.characterBubble,
              isError && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {!isError && (
              <span
                className={cn(
                  "pointer-events-none absolute top-4 -left-1 size-2.5 rotate-45 border-b border-l",
                  visualPreset.tavern.characterBubbleTail,
                )}
                aria-hidden
              />
            )}
            {displayThought && !isError && (
              <div
                className="mb-3 ml-1 w-fit max-w-[94%] rounded-[9px] rounded-tl-[3px] border border-dashed border-current/28 bg-current/[0.085] px-3.5 py-2 text-current shadow-[inset_0_1px_12px_rgba(255,255,255,0.09)] opacity-90"
                aria-label="角色内心想法"
              >
                <p className="whitespace-pre-wrap break-words font-serif text-[12.5px] leading-6 italic opacity-95">
                  （{displayThought}）
                </p>
              </div>
            )}
            {displaySegments.length > 0 ? (
              <MessageSegmentsContent
                segments={displaySegments}
                className={immersiveDescriptionEnabled ? "font-serif leading-7" : "leading-6"}
                actionClassName={immersiveDescriptionEnabled ? "tavern-immersive-em" : undefined}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words">{displayContent}</div>
            )}
          </div>
          <MessageControls content={copyContent} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
};
