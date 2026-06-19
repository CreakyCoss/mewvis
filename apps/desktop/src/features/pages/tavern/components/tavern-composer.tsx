import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { FileText, Loader2, PencilLine, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernReplyMode, TavernReplyOption } from "../types";

type TavernComposerProps = {
  draft: string;
  error: string;
  isSending: boolean;
  isGeneratingReplySuggestions: boolean;
  replySuggestions: TavernReplyOption[];
  visualPreset: VisualPresetDefinition;
  activeCharacter: TavernCharacter | null;
  replyMode: TavernReplyMode;
  isManagedModeEnabled: boolean;
  isManagedAutoRunStarted: boolean;
  speakerCount: number;
  referencedFilePreviews: WorkspaceFileEntry[];
  referenceSuggestions: WorkspaceFileEntry[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onInsertReference: (file: WorkspaceFileEntry) => void;
  onGenerateReplySuggestions: () => void;
  onSelectReplySuggestion: (suggestion: TavernReplyOption) => void;
  onFillReplySuggestion: (suggestion: TavernReplyOption) => void;
  onSubmit: (event?: FormEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export const TavernComposer = ({
  draft,
  error,
  isSending,
  isGeneratingReplySuggestions,
  replySuggestions,
  visualPreset,
  activeCharacter,
  replyMode,
  isManagedModeEnabled,
  isManagedAutoRunStarted,
  speakerCount,
  referencedFilePreviews,
  referenceSuggestions,
  inputRef,
  onDraftChange,
  onCursorChange,
  onInsertReference,
  onGenerateReplySuggestions,
  onSelectReplySuggestion,
  onFillReplySuggestion,
  onSubmit,
  onKeyDown,
}: TavernComposerProps) => {
  const isManagedAutoRunning = isManagedModeEnabled && isManagedAutoRunStarted;
  const placeholder = isManagedAutoRunning
    ? "全托管运行中，关闭托管可重新手动发言..."
    : isManagedModeEnabled
    ? "全托管：首次留空发送启动，后续自动运行..."
    : replyMode === "director"
    ? "让导演决定谁来回应..."
    : replyMode === "round" && speakerCount > 1
      ? `让 ${speakerCount} 位角色依次回应...`
      : activeCharacter ? `对 ${activeCharacter.name} 说点什么...` : "写下一句对白...";
  const canSubmit = (isManagedModeEnabled && !isManagedAutoRunning) || Boolean(draft.trim());

  return (
    <form
      className={cn(
        "border-t px-4 py-3 sm:px-5",
        visualPreset.tavern.composer,
      )}
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
        {(replySuggestions.length > 0 || isGeneratingReplySuggestions) && (
          <div
            className={cn(
              "space-y-2 rounded-md border p-2.5 text-current shadow-sm",
              visualPreset.tavern.sceneCard,
            )}
            role="list"
            aria-label="候选回复"
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              {isGeneratingReplySuggestions ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
              <span>{isGeneratingReplySuggestions ? "正在生成候选回复" : "候选回复"}</span>
            </div>
            {replySuggestions.length > 0 && (
              <div className="grid gap-1.5">
                {replySuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex min-h-10 overflow-hidden rounded-md border border-current/10 bg-current/5 text-sm leading-5 transition-colors focus-within:ring-2 focus-within:ring-ring"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-current/10 focus-visible:outline-none"
                      title="直接发送"
                      aria-label={`直接发送候选回复：${suggestion.text}`}
                      disabled={isSending || isGeneratingReplySuggestions}
                      onClick={() => onSelectReplySuggestion(suggestion)}
                    >
                      {suggestion.text}
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-auto min-h-10 w-10 shrink-0 rounded-none border-0 border-l border-current/10 bg-transparent text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
                      title="填入输入框后编辑"
                      aria-label={`填入输入框编辑候选回复：${suggestion.text}`}
                      disabled={isSending || isGeneratingReplySuggestions}
                      onClick={() => onFillReplySuggestion(suggestion)}
                    >
                      <PencilLine className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
            className={cn(
              "min-h-[92px] resize-none pr-24 text-sm leading-6",
              visualPreset.tavern.composerInput,
            )}
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
            type="button"
            size="icon"
            variant="outline"
            className="absolute right-14 bottom-3 size-9 border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
            title={isGeneratingReplySuggestions ? "正在生成候选回复" : "生成回复"}
            aria-label={isGeneratingReplySuggestions ? "正在生成候选回复" : "生成回复"}
            disabled={isSending || isGeneratingReplySuggestions}
            onClick={onGenerateReplySuggestions}
          >
            {isGeneratingReplySuggestions ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
          </Button>
          <Button
            type="submit"
            size="icon"
            className="absolute right-3 bottom-3 size-9"
            title={isSending ? "正在回应" : isManagedAutoRunning ? "全托管运行中" : isManagedModeEnabled ? "启动全托管" : "发送"}
            aria-label={isSending ? "正在回应" : isManagedAutoRunning ? "全托管运行中" : isManagedModeEnabled ? "启动全托管" : "发送"}
            disabled={isSending || isManagedAutoRunning || !canSubmit}
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
