import { Loader2 } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { SmoothMarkdownContent } from "@/features/ai/components/markdown";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type {
  TavernCharacter,
  TavernFactEvent,
} from "../../types";
import { MessageControls } from "./message-controls";
import { MessagePrivateIntel } from "./message-private-intel";
import { formatTavernMessageTime } from "./message-time";

type CharacterTavernMessageProps = {
  character?: TavernCharacter | null;
  content: string;
  createdAt: number;
  factEvents?: TavernFactEvent[];
  immersiveDescriptionEnabled: boolean;
  isError: boolean;
  isStreaming: boolean;
  thought?: string;
  visualPreset: VisualPresetDefinition;
};
export const CharacterTavernMessage = ({
  character,
  content,
  createdAt,
  factEvents,
  immersiveDescriptionEnabled,
  isError,
  isStreaming,
  thought,
  visualPreset,
}: CharacterTavernMessageProps) => {
  const avatar = resolveAgentAvatar(character?.avatar);
  const displayThought = thought?.trim() ?? "";
  const copyContent = displayThought
    ? `心想：${displayThought}\n\n${content}`
    : content;
  const immersiveDescriptionClassName = immersiveDescriptionEnabled
    ? "tavern-immersive-em"
    : undefined;

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <img
          src={avatar.src}
          alt=""
          className="size-10 shrink-0 rounded-md"
        />
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
            <SmoothMarkdownContent
              className={immersiveDescriptionEnabled ? "tavern-immersive-markdown" : undefined}
              content={content}
              emClassName={immersiveDescriptionClassName}
              isStreaming={isStreaming}
              separateEmphasisBlocks={immersiveDescriptionEnabled}
              variant="tavern"
            />
          </div>
          <MessagePrivateIntel align="left" factEvents={factEvents} />
          <MessageControls content={copyContent} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
};
