import {
  FileText,
  UserRound,
} from "lucide-react";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type {
  TavernFactEvent,
  TavernMessage,
} from "../../types";
import { MessageControls } from "./message-controls";
import { MessagePrivateIntel } from "./message-private-intel";
import { formatTavernMessageTime } from "./message-time";

type UserMessageProps = {
  content: string;
  createdAt: number;
  factEvents?: TavernFactEvent[];
  isSending: boolean;
  isStreaming: boolean;
  referencedFiles?: TavernMessage["referencedFiles"];
  userPersonaName: string;
  visualPreset: VisualPresetDefinition;
};
export const UserMessage = ({
  content,
  createdAt,
  factEvents,
  isSending,
  isStreaming,
  referencedFiles,
  userPersonaName,
  visualPreset,
}: UserMessageProps) => (
  <div className="group/message flex justify-end">
    <div className="flex max-w-[min(80%,680px)] flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 text-xs text-current opacity-75">
        <span>{userPersonaName || "我"}</span>
        <UserRound className="size-3.5" />
      </div>
      <div
        className={cn(
          "relative overflow-visible rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
          visualPreset.tavern.userBubble,
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-4 -right-1 size-2.5 rotate-45 border-t border-r",
            visualPreset.tavern.userBubbleTail,
          )}
          aria-hidden
        />
        <div className="whitespace-pre-wrap break-words">{content}</div>
        {referencedFiles && referencedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            {referencedFiles.map((file) => (
              <span
                key={file.path}
                className="inline-flex max-w-full items-center gap-1 rounded-[5px] bg-primary-foreground/15 px-1.5 py-0.5 text-[11px] text-primary-foreground/85"
                title={file.path}
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{file.path}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-[11px] text-current opacity-70">
        {formatTavernMessageTime(createdAt)}
      </span>
      <MessagePrivateIntel align="right" factEvents={factEvents} />
      <MessageControls content={content} disabled={isSending || isStreaming} />
    </div>
  </div>
);
