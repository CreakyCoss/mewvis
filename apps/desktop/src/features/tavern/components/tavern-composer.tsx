import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceFileEntry } from "@/features/workspace-chat/types";
import type { TavernCharacter, TavernReplyMode } from "../types";

type TavernComposerProps = {
  draft: string;
  error: string;
  isSending: boolean;
  activeCharacter: TavernCharacter | null;
  replyMode: TavernReplyMode;
  speakerCount: number;
  referencedFilePreviews: WorkspaceFileEntry[];
  referenceSuggestions: WorkspaceFileEntry[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onInsertReference: (file: WorkspaceFileEntry) => void;
  onSubmit: (event?: FormEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export const TavernComposer = ({
  draft,
  error,
  isSending,
  activeCharacter,
  replyMode,
  speakerCount,
  referencedFilePreviews,
  referenceSuggestions,
  inputRef,
  onDraftChange,
  onCursorChange,
  onInsertReference,
  onSubmit,
  onKeyDown,
}: TavernComposerProps) => {
  const placeholder = replyMode === "director"
    ? "让导演决定谁来回应..."
    : replyMode === "round" && speakerCount > 1
      ? `让 ${speakerCount} 位角色依次回应...`
      : activeCharacter ? `对 ${activeCharacter.name} 说点什么...` : "写下一句对白...";

  return (
  <form
    className="border-t bg-background/95 px-4 py-3 sm:px-5"
    onSubmit={(event) => onSubmit(event)}
  >
    <div className="mx-auto max-w-3xl space-y-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {referencedFilePreviews.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {referencedFilePreviews.map((file) => (
            <span
              key={file.path}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/35 px-2 py-1 text-xs text-muted-foreground"
              title={file.path}
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{file.path}</span>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        {referenceSuggestions.length > 0 && (
          <div className="absolute right-0 bottom-full left-0 z-10 mb-2 overflow-hidden rounded-md border bg-popover shadow-lg">
            <div className="max-h-56 overflow-y-auto p-1">
              {referenceSuggestions.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-[5px] px-2.5 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onInsertReference(file)}
                  title={file.path}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Textarea
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          className="min-h-[92px] resize-none pr-14 text-sm leading-6"
          onChange={(event) => {
            onDraftChange(
              event.target.value,
              event.target.selectionStart ?? event.target.value.length,
            );
          }}
          onClick={(event) => onCursorChange(event.currentTarget.selectionStart ?? draft.length)}
          onKeyUp={(event) => onCursorChange(event.currentTarget.selectionStart ?? draft.length)}
          onKeyDown={onKeyDown}
          onSelect={(event) => onCursorChange(event.currentTarget.selectionStart ?? draft.length)}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-3 bottom-3 size-9"
          title={isSending ? "正在回应" : "发送"}
          aria-label={isSending ? "正在回应" : "发送"}
          disabled={isSending || !draft.trim()}
        >
          {isSending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  </form>
  );
};
