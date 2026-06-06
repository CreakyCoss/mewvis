import { useEffect, useState } from "react";
import {
  Check,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VisualPresetDefinition } from "@/features/visual-presets";
import { SmoothMarkdownContent } from "@/features/workspace-chat/components/chat/smooth-stream-content";
import { cn } from "@/lib/utils";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";

type TavernMessageRowProps = {
  message: TavernMessage;
  room: TavernRoom;
  visualPreset: VisualPresetDefinition;
  character?: TavernCharacter | null;
  isSending: boolean;
  onUpdateMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
};

const formatMessageTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const TavernMessageRow = ({
  message,
  room,
  visualPreset,
  character,
  isSending,
  onUpdateMessage,
  onDeleteMessage,
}: TavernMessageRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isStreaming = message.status === "streaming";
  const canManage = !isSending && !isStreaming;

  useEffect(() => {
    if (!isEditing) {
      setDraft(message.content);
    }
  }, [isEditing, message.content]);

  const saveEdit = () => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    onUpdateMessage(message.id, content);
    setIsEditing(false);
  };

  const controls = (
    <MessageControls
      canManage={canManage}
      isEditing={isEditing}
      onStartEdit={() => setIsEditing(true)}
      onCancelEdit={() => {
        setDraft(message.content);
        setIsEditing(false);
      }}
      onSaveEdit={saveEdit}
      onDelete={() => onDeleteMessage(message.id)}
    />
  );

  if (message.role === "narrator") {
    return (
      <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm",
            visualPreset.tavern.narratorBubble,
          )}
        >
          {isEditing ? (
            <Textarea
              value={draft}
              className="min-h-[72px] resize-none bg-background text-left text-sm text-foreground"
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            message.content
          )}
        </div>
        {controls}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="group/message flex justify-end">
        <div className="flex max-w-[min(80%,680px)] flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{room.userPersonaName || "我"}</span>
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
            {isEditing ? (
              <Textarea
                value={draft}
                className="min-h-[84px] resize-none bg-primary-foreground text-sm text-foreground"
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            )}
            {message.referencedFiles && message.referencedFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                {message.referencedFiles.map((file) => (
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
          <span className="text-[11px] text-muted-foreground/70">
            {formatMessageTime(message.createdAt)}
          </span>
          {controls}
        </div>
      </div>
    );
  }

  const avatar = resolveAgentAvatar(character?.avatar);
  const isError = message.status === "error";

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <img
          src={avatar.src}
          alt=""
          className="size-10 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{character?.name ?? "角色"}</span>
            <span>{formatMessageTime(message.createdAt)}</span>
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
            {isEditing ? (
              <Textarea
                value={draft}
                className="min-h-[96px] resize-none bg-background text-sm text-foreground"
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : (
              <SmoothMarkdownContent
                content={message.content}
                isStreaming={isStreaming}
              />
            )}
          </div>
          {controls}
        </div>
      </div>
    </div>
  );
};

type MessageControlsProps = {
  canManage: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
};

const MessageControls = ({
  canManage,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: MessageControlsProps) => {
  if (!canManage) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
      {isEditing ? (
        <>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="保存"
            aria-label="保存"
            onClick={onSaveEdit}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="取消"
            aria-label="取消"
            onClick={onCancelEdit}
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="编辑"
            aria-label="编辑"
            onClick={onStartEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title="删除"
            aria-label="删除"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
};
