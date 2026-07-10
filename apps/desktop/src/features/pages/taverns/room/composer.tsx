import type { FormEvent, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { uniqBy } from "lodash-es";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getActiveReferenceToken,
  loadContextResources,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
  type PromptFileReference,
} from "@/features/ai/components/context-tools";
import { readWorkspaceFile, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import { getTavernPresentationProfile } from "@/features/pages/taverns/presets/prompts/presentation-rules";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  isTavernRoomSending,
  useTavernRoomContext,
} from "@/features/pages/taverns/room/context";
import { getTavernAgentFlowErrorMessage, submitTavernAgentFlow } from "./agent-flow/submission";

const REFERENCE_SUGGESTION_LIMIT = 8;

export type ComposerSubmitPayload = {
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: Array<{ token: string }>;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<PromptFileReference[]>;
};

export type ComposerHandle = {
  getDraft: () => string;
  getSubmitPayload: () => ComposerSubmitPayload;
  clearDraft: () => void;
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
  const story = useTavernRoomContext((store) => store.story);
  const busy = useTavernRoomContext((store) => store.busy);
  const error = useTavernRoomContext((store) => store.error);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setComposerHandle = useTavernRoomContext((store) => store.setComposerHandle);
  const setError = useTavernRoomContext((store) => store.setError);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const workspacePath = useTavernRoomContext((store) => store.workspacePath);
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isSending = isTavernRoomSending(busy);
  const isBusy = isTavernRoomBusy(busy);
  const presentationProfile = getTavernPresentationProfile(story?.roomConfig.presentation.profileId);
  const placeholder = presentationProfile.composerPlaceholder;
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
    () => uniqBy(summarizeReferenceMatches(fileReferenceMatches), "path"),
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

  const clearDraft = useCallback(() => {
    setDraft("");
    setDraftCursor(0);
  }, []);

  const readReferencedFiles = useCallback(async (): Promise<PromptFileReference[]> => {
    const resources = await loadContextResources({
      references: referencedFilePreviews.map((file) => ({ path: file.path })),
      loadFile: async ({ path }) => {
        const workspaceFile = await readWorkspaceFile(workspacePath, path);
        return {
          path: workspaceFile.path,
          content: workspaceFile.content,
          updatedAt: workspaceFile.updatedAt,
        };
      },
    });
    return resources.references;
  }, [referencedFilePreviews, workspacePath]);

  const createSubmitPayload = useCallback(
    (text: string, { includeReferences }: { includeReferences: boolean }): ComposerSubmitPayload => ({
      text,
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
    }),
    [clearDraft, createSubmitPayload, draft],
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
    clearDraft();
  }, [story?.id, clearDraft]);

  const submitPayload = useCallback(
    async (payload: ComposerSubmitPayload) => {
      try {
        await submitTavernAgentFlow({
          submittedText: payload.text,
          ambiguousFileReferences: payload.ambiguousFileReferences,
          readReferencedFiles: payload.readReferencedFiles,
          referencedFilePreviews: payload.referencedFilePreviews,
          unresolvedFileReferences: payload.unresolvedFileReferences,
          onCommitted: () => {
            clearDraft();
          },
        });
      } catch (submitError) {
        console.error("Failed to submit tavern story turn", submitError);
        setError(`酒馆回应失败：${getTavernAgentFlowErrorMessage(submitError)}`);
        setBusy(createIdleTavernRoomBusyState());
      }
    },
    [clearDraft, setBusy, setError],
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
