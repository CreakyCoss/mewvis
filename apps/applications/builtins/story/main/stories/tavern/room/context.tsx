import type { SetStateAction } from "react";
import { create } from "zustand";
import type { RuntimeModelInput } from "@/platform/models";
import type { TavernStoryData } from "@/stories/tavern/room/model";
import { getVisualPreset } from "@/stories/tavern/presets/visual-presets";
import type { VisualPresetDefinition } from "@/stories/tavern/presets/visual-presets/types";
import type { TavernMessage } from "@/stories/tavern/room/model/message";
import type { ComposerHandle } from "./composer";

export type ExecutionStep = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
};

export type TavernRoomBusyKind = "idle" | "sending";

export type TavernRoomBusyState = {
  kind: TavernRoomBusyKind;
  status: string;
};

export const createIdleTavernRoomBusyState = (): TavernRoomBusyState => ({
  kind: "idle",
  status: "",
});

export const isTavernRoomBusy = (busy: TavernRoomBusyState) => busy.kind !== "idle";

export const isTavernRoomSending = (busy: TavernRoomBusyState) => busy.kind === "sending";

type TavernRoomDerivedState = {
  visualPreset: VisualPresetDefinition;
};

type TavernRoomStoreBase = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput | null;
  story: TavernStoryData | null;
  messages: TavernMessage[];
  composerHandle: ComposerHandle | null;
  error: string;
  busy: TavernRoomBusyState;
  executionSteps: ExecutionStep[];
  executionTraceAnchorMessageId: string;
} & TavernRoomDerivedState;

type TavernRoomStoreInitialization = {
  workspacePath: string;
  story: TavernStoryData;
  messages: TavernMessage[];
};

type TavernRoomStoreActions = {
  initializeRoom: (input: TavernRoomStoreInitialization) => void;
  setRuntimeModel: (runtimeModel: RuntimeModelInput | null) => void;
  setComposerHandle: (composerHandle: ComposerHandle | null) => void;
  setStory: (story: TavernStoryData) => void;
  setMessages: (messages: TavernMessage[]) => void;
  setError: (error: string) => void;
  setBusy: (busy: TavernRoomBusyState) => void;
  setBusyStatus: (status: string) => void;
  setExecutionSteps: (updater: SetStateAction<ExecutionStep[]>) => void;
  setExecutionTraceAnchorMessageId: (messageId: string) => void;
  patchExecutionStep: (stepId: string, patch: Partial<Omit<ExecutionStep, "id">>) => void;
  upsertExecutionStep: (step: ExecutionStep) => void;
  appendMessages: (roomConfigId: string, messages: TavernMessage[]) => void;
};

export type TavernRoomStore = TavernRoomStoreBase & TavernRoomStoreActions;

const deriveStoryState = (story: TavernStoryData | null): TavernRoomDerivedState => ({
  visualPreset: getVisualPreset(story?.roomConfig.scenePresetId),
});

const createBaseStoreState = (
  input?: TavernRoomStoreInitialization,
  runtimeModel: RuntimeModelInput | null = null,
): TavernRoomStoreBase => {
  const story = input?.story ?? null;
  return {
    workspacePath: input?.workspacePath.trim() ?? "",
    runtimeModel,
    story,
    messages: input?.messages ?? [],
    composerHandle: null,
    error: "",
    busy: createIdleTavernRoomBusyState(),
    executionSteps: [],
    executionTraceAnchorMessageId: "",
    ...deriveStoryState(story),
  };
};

export const useTavernRoomContext = create<TavernRoomStore>((set) => ({
  ...createBaseStoreState(),
  initializeRoom: (input) => {
    set((current) => createBaseStoreState(input, current.runtimeModel));
  },
  setRuntimeModel: (runtimeModel) => {
    set({ runtimeModel });
  },
  setComposerHandle: (composerHandle) => {
    set({ composerHandle });
  },
  setStory: (story) => {
    set({ story, ...deriveStoryState(story) });
  },
  setMessages: (messages) => {
    set({ messages });
  },
  setError: (error) => {
    set({ error });
  },
  setBusy: (busy) => {
    set({ busy });
  },
  setBusyStatus: (status) => {
    set((current) => ({ busy: { ...current.busy, status } }));
  },
  setExecutionSteps: (updater) => {
    set((current) => ({
      executionSteps: typeof updater === "function" ? updater(current.executionSteps) : updater,
    }));
  },
  setExecutionTraceAnchorMessageId: (executionTraceAnchorMessageId) => {
    set({ executionTraceAnchorMessageId });
  },
  patchExecutionStep: (stepId, patch) => {
    set((current) => ({
      executionSteps: current.executionSteps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  },
  upsertExecutionStep: (step) => {
    set((current) => ({
      executionSteps: current.executionSteps.some((item) => item.id === step.id)
        ? current.executionSteps.map((item) => (item.id === step.id ? { ...item, ...step } : item))
        : [...current.executionSteps, step],
    }));
  },
  appendMessages: (roomConfigId, messages) => {
    set((current) => {
      const currentStory = current.story;
      if (!currentStory || currentStory.roomConfig.id !== roomConfigId) {
        return current;
      }

      return { messages: [...current.messages, ...messages] };
    });
  },
}));
