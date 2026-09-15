import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getTavernPresentationProfile } from "@/workbench/pages/stories/tavern/presets/prompts/presentation-rules";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  isTavernRoomSending,
  useTavernRoomContext,
} from "@/workbench/pages/stories/tavern/room/context";
import { getTavernAgentFlowErrorMessage, submitTavernAgentFlow } from "./agent-flow/submission";

export type ComposerSubmitPayload = {
  text: string;
};

export type ComposerHandle = {
  getSubmitPayload: () => ComposerSubmitPayload;
  clearDraft: () => void;
};

export const createEmptyComposerSubmitPayload = (): ComposerSubmitPayload => ({ text: "" });

export const Composer = () => {
  const story = useTavernRoomContext((store) => store.story);
  const busy = useTavernRoomContext((store) => store.busy);
  const error = useTavernRoomContext((store) => store.error);
  const setBusy = useTavernRoomContext((store) => store.setBusy);
  const setComposerHandle = useTavernRoomContext((store) => store.setComposerHandle);
  const setError = useTavernRoomContext((store) => store.setError);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const [draft, setDraft] = useState("");
  const isSending = isTavernRoomSending(busy);
  const isBusy = isTavernRoomBusy(busy);
  const presentationProfile = getTavernPresentationProfile(story?.roomConfig.presentation.profileId);

  const clearDraft = useCallback(() => {
    setDraft("");
  }, []);
  const composerHandle = useMemo<ComposerHandle>(
    () => ({
      getSubmitPayload: () => ({ text: draft }),
      clearDraft,
    }),
    [clearDraft, draft],
  );

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
  }, [story?.chapterId, clearDraft]);

  const submitDraft = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const text = draft.trim();
      if (!text || isBusy) {
        return;
      }

      try {
        await submitTavernAgentFlow({
          submittedText: text,
          onCommitted: clearDraft,
        });
      } catch (submitError) {
        console.error("Failed to submit tavern story turn", submitError);
        setError(`酒馆回应失败：${getTavernAgentFlowErrorMessage(submitError)}`);
        setBusy(createIdleTavernRoomBusyState());
      }
    },
    [clearDraft, draft, isBusy, setBusy, setError],
  );

  return (
    <form className={cn("border-t px-4 py-3 sm:px-5", visualPreset.tavern.composer)} onSubmit={submitDraft}>
      <div className="mx-auto max-w-3xl space-y-2">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm leading-6 text-destructive">
            {error}
          </div>
        ) : null}
        <div className="relative">
          <Textarea
            value={draft}
            placeholder={presentationProfile.composerPlaceholder}
            disabled={isBusy}
            className={cn("min-h-[92px] resize-none pr-14 text-sm leading-6", visualPreset.tavern.composerInput)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submitDraft();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-3 bottom-3 size-9 rounded-full"
            title={isSending ? "正在回应" : "发送"}
            aria-label={isSending ? "正在回应" : "发送"}
            disabled={isBusy || !draft.trim()}
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};
