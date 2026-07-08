import type { FormEvent, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { FileText, Loader2, PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getActiveReferenceToken,
  loadContextResources,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/ai/components/context-tools";
import { readWorkspaceFile, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import type { TavernReplyOption } from "@/features/pages/taverns/manage/model";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import type { TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import { uniqueFilesByPath } from "@/features/pages/taverns/tavern/utils";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  isTavernRoomSending,
  useTavernRoomContext,
} from "@/features/pages/taverns/room/context";
import { getTavernRoomSceneFields } from "./model";
import { submitRoomTurn } from "./turn/submit";
import { getErrorMessage } from "./turn/submit-flow/shared";

const REFERENCE_SUGGESTION_LIMIT = 8;

export type ComposerSubmitPayload = {
  text: string;
  selectedReplyOption?: TavernReplyOption;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: Array<{ token: string }>;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
};

export type ComposerHandle = {
  getDraft: () => string;
  getSubmitPayload: () => ComposerSubmitPayload;
  clearDraft: () => void;
  clearReplyOptions: () => void;
};

type ComposerProps = {
  bind?: Ref<ComposerHandle>;
  files: WorkspaceFileEntry[];
};

export const createEmptyComposerSubmitPayload = (): ComposerSubmitPayload => ({
  text: "",
  referencedFilePreviews: [],
  unresolvedFileReferences: [],
  ambiguousFileReferences: [],
  readReferencedFiles: async () => [],
});

export const Composer = ({ bind, files }: ComposerProps) => {
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const busy = useTavernRoomContext((store) => store.busy);
  const error = useTavernRoomContext((store) => store.error);
  const patchRoom = useTavernRoomContext((store) => store.patchRoom);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setComposerHandle = useTavernRoomContext((store) => store.setComposerHandle);
  const setError = useTavernRoomContext((store) => store.setError);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const workspace = useTavernRoomContext((store) => store.workspace);
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [replyOptions, setReplyOptions] = useState<TavernReplyOption[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isSending = isTavernRoomSending(busy);
  const isBusy = isTavernRoomBusy(busy);
  const presentationProfile = getTavernPresentationProfile(activeRoom?.presentation.profile?.profileId);
  const placeholder =
    presentationProfile.userInputMode !== "speech"
      ? presentationProfile.composerPlaceholder
      : "写给导演的方向，或留空点自推...";
  const canSubmit = Boolean(draft.trim());
  const selectableFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const activeReferenceToken = useMemo(() => getActiveReferenceToken(draft, draftCursor), [draft, draftCursor]);
  const referenceSuggestions = useMemo(() => {
    if (!activeReferenceToken) {
      return [];
    }

    const query = activeReferenceToken.query.toLowerCase();
    return selectableFiles
      .filter((file) => {
        if (!query) {
          return true;
        }

        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(query) || name.includes(query);
      })
      .slice(0, REFERENCE_SUGGESTION_LIMIT);
  }, [activeReferenceToken, selectableFiles]);
  const fileReferenceMatches = useMemo(() => resolveFileReferenceMatches(draft, files), [draft, files]);
  const referencedFilePreviews = useMemo(
    () => uniqueFilesByPath(summarizeReferenceMatches(fileReferenceMatches)),
    [fileReferenceMatches],
  );
  const unresolvedFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length === 0),
    [fileReferenceMatches],
  );
  const ambiguousFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length > 1),
    [fileReferenceMatches],
  );

  const clearReplyOptions = useCallback(() => {
    setReplyOptions([]);
  }, []);

  const clearDraft = useCallback(() => {
    setDraft("");
    setDraftCursor(0);
  }, []);

  const readReferencedFiles = useCallback(async (): Promise<TavernReferencedFile[]> => {
    const resources = await loadContextResources({
      references: referencedFilePreviews.map((file) => ({ path: file.path })),
      loadFile: async ({ path }) => {
        const workspaceFile = await readWorkspaceFile(workspace.path, path);
        return {
          path: workspaceFile.path,
          content: workspaceFile.content,
          updatedAt: workspaceFile.updatedAt,
        };
      },
    });
    return resources.references.map((file) => ({
      path: file.path,
      content: file.content,
    }));
  }, [referencedFilePreviews, workspace.path]);

  const createSubmitPayload = useCallback(
    (
      text: string,
      {
        selectedReplyOption,
        includeReferences,
      }: {
        selectedReplyOption?: TavernReplyOption;
        includeReferences: boolean;
      },
    ): ComposerSubmitPayload => ({
      text,
      selectedReplyOption,
      referencedFilePreviews: includeReferences ? referencedFilePreviews : [],
      unresolvedFileReferences: includeReferences ? unresolvedFileReferences : [],
      ambiguousFileReferences: includeReferences ? ambiguousFileReferences : [],
      readReferencedFiles: includeReferences ? readReferencedFiles : async () => [],
    }),
    [ambiguousFileReferences, readReferencedFiles, referencedFilePreviews, unresolvedFileReferences],
  );

  const composerHandle = useMemo<ComposerHandle>(
    () => ({
      getDraft: () => draft,
      getSubmitPayload: () => createSubmitPayload(draft, { includeReferences: true }),
      clearDraft,
      clearReplyOptions,
    }),
    [clearDraft, clearReplyOptions, createSubmitPayload, draft],
  );

  useImperativeHandle(bind, () => composerHandle, [bind, composerHandle]);

  useEffect(() => {
    setComposerHandle(composerHandle);
    return () => {
      const store = useTavernRoomContext.getState();
      if (store.composerHandle === composerHandle) {
        store.setComposerHandle(null);
      }
    };
  }, [composerHandle, setComposerHandle]);

  useEffect(() => {
    setReplyOptions(activeRoom ? getTavernRoomSceneFields(activeRoom).replyOptions : []);
    clearDraft();
  }, [activeRoom?.identity.id, clearDraft]);

  const submitPayload = useCallback(
    async (payload: ComposerSubmitPayload) => {
      try {
        await submitRoomTurn({
          submittedText: payload.text,
          selectedReplyOption: payload.selectedReplyOption,
          ambiguousFileReferences: payload.ambiguousFileReferences,
          readReferencedFiles: payload.readReferencedFiles,
          referencedFilePreviews: payload.referencedFilePreviews,
          unresolvedFileReferences: payload.unresolvedFileReferences,
          onCommitted: () => {
            clearDraft();
            clearReplyOptions();
          },
        });
      } catch (submitError) {
        console.error("Failed to submit tavern room turn", submitError);
        setError(`酒馆回应失败：${getErrorMessage(submitError)}`);
        setBusy(createIdleTavernRoomBusyState());
      }
    },
    [clearDraft, clearReplyOptions, setBusy, setError],
  );

  const insertReference = useCallback(
    (file: WorkspaceFileEntry) => {
      const reference = `${quoteReferencePath(file.path)} `;
      const start = activeReferenceToken?.start ?? draftCursor;
      const end = activeReferenceToken?.end ?? draftCursor;
      const nextCursor = start + reference.length;

      setDraft((current) => `${current.slice(0, start)}${reference}${current.slice(end)}`);
      setDraftCursor(nextCursor);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    },
    [activeReferenceToken, draftCursor],
  );

  const submitDraft = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = draft.trim();
      if (!text || isBusy) {
        return;
      }

      void submitPayload(createSubmitPayload(text, { includeReferences: true }));
    },
    [createSubmitPayload, draft, isBusy, submitPayload],
  );

  const submitReplyOption = useCallback(
    (option: TavernReplyOption) => {
      if (isBusy) {
        return;
      }

      void submitPayload(
        createSubmitPayload(option.text.trim(), { selectedReplyOption: option, includeReferences: false }),
      );
    },
    [createSubmitPayload, isBusy, submitPayload],
  );

  const fillReplyOption = useCallback(
    (option: TavernReplyOption) => {
      const nextDraft = option.text.trim();
      if (!nextDraft) {
        return;
      }

      setDraft(nextDraft);
      setDraftCursor(nextDraft.length);
      clearReplyOptions();
      if (activeRoom) {
        patchRoom(activeRoom.identity.id, (room) => {
          const updatedAt = Date.now();
          return {
            ...room,
            identity: {
              ...room.identity,
              updatedAt,
            },
            config: {
              room: {
                ...room.config.room,
                updatedAt,
              },
            },
            scene: {
              ...room.scene,
              replyOptions: [],
              updatedAt,
            },
          };
        });
      }
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextDraft.length, nextDraft.length);
      }, 0);
    },
    [activeRoom, clearReplyOptions, patchRoom],
  );

  return (
    <form className={cn("border-t px-4 py-3 sm:px-5", visualPreset.tavern.composer)} onSubmit={submitDraft}>
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
        {replyOptions.length > 0 && (
          <div
            className={cn("space-y-2 rounded-md border p-2.5 text-current shadow-sm", visualPreset.tavern.sceneCard)}
            role="list"
            aria-label="候选回复"
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <PencilLine className="size-3.5 text-primary" />
              <span>候选回复</span>
            </div>
            <div className="grid gap-1.5">
              {replyOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex min-h-10 overflow-hidden rounded-md border border-current/10 bg-current/5 text-sm leading-5 transition-colors focus-within:ring-2 focus-within:ring-ring"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-current/10 focus-visible:outline-none"
                    title="直接发送"
                    aria-label={`直接发送候选回复：${option.text}`}
                    disabled={isBusy}
                    onClick={() => submitReplyOption(option)}
                  >
                    {option.text}
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-auto min-h-10 w-10 shrink-0 rounded-none border-0 border-l border-current/10 bg-transparent text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
                    title="填入输入框后编辑"
                    aria-label={`填入输入框编辑候选回复：${option.text}`}
                    disabled={isBusy}
                    onClick={() => fillReplyOption(option)}
                  >
                    <PencilLine className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
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
                    onClick={() => insertReference(file)}
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
            className={cn("min-h-[92px] resize-none pr-14 text-sm leading-6", visualPreset.tavern.composerInput)}
            onChange={(event) => {
              setDraft(event.target.value);
              setDraftCursor(event.target.selectionStart ?? event.target.value.length);
            }}
            onClick={(event) => setDraftCursor(event.currentTarget.selectionStart ?? draft.length)}
            onKeyUp={(event) => setDraftCursor(event.currentTarget.selectionStart ?? draft.length)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitDraft();
              }
            }}
            onSelect={(event) => setDraftCursor(event.currentTarget.selectionStart ?? draft.length)}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-3 bottom-3 size-9"
            title={isSending ? "正在回应" : "发送"}
            aria-label={isSending ? "正在回应" : "发送"}
            disabled={isBusy || !canSubmit}
          >
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </form>
  );
};
