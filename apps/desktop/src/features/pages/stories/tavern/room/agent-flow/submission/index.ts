import type { FormEvent } from "react";
import type { PromptFileReference } from "@/features/ai/components/context-tools";
import type { WorkspaceFileEntry } from "@/api/workspace-files";
import { createTavernTextMessageBody, type TavernMessage } from "@/features/pages/stories/tavern/room/model/message";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  useTavernRoomContext,
  type TavernRoomStore,
} from "@/features/pages/stories/tavern/room/context";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import { TavernAgentFlow } from "..";
import type { TavernAgentFlowTrigger } from "../types";

export type SubmitTavernAgentFlowTrigger = TavernAgentFlowTrigger;

type SubmitTavernAgentFlowParams = {
  event?: FormEvent;
  submittedText?: string;
  trigger?: SubmitTavernAgentFlowTrigger;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<PromptFileReference[]>;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: Array<{ token: string }>;
  onCommitted?: () => void;
};

export const getTavernAgentFlowErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
};

const validateSubmitReferences = ({
  unresolvedFileReferences,
  ambiguousFileReferences,
}: {
  unresolvedFileReferences: Array<{ token: string }>;
  ambiguousFileReferences: Array<{ token: string }>;
}) => {
  if (unresolvedFileReferences.length > 0) {
    return `未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`;
  }

  if (ambiguousFileReferences.length > 0) {
    return `引用文件不唯一：${ambiguousFileReferences.map((match) => `@${match.token}`).join("、")}`;
  }

  return "";
};

const createUserMessage = ({
  roomId,
  text,
  turnId,
  referencedFilePreviews,
}: {
  roomId: string;
  text: string;
  turnId: string;
  referencedFilePreviews: WorkspaceFileEntry[];
}): TavernMessage => ({
  id: createTimestampId("msg"),
  roomId,
  turnId,
  kind: "user_text",
  role: "user",
  body: createTavernTextMessageBody(text),
  referencedFiles: referencedFilePreviews.map((file) => ({ path: file.path })),
  createdAt: getCurrentTimestamp(),
  status: "done",
});

const beginSubmission = ({ ctx, isSceneDrive }: { ctx: TavernRoomStore; isSceneDrive: boolean }) => {
  ctx.setBusy({
    kind: "sending",
    status: isSceneDrive ? "导演正在自推动场景..." : "导演正在调度角色...",
  });
  ctx.setError("");
  ctx.setExecutionSteps([
    {
      id: "director",
      label: "导演调度",
      status: "pending",
    },
  ]);
};

const readSubmitReferences = async ({
  ctx,
  referencedFilePreviews,
  readReferencedFiles,
}: {
  ctx: TavernRoomStore;
  referencedFilePreviews: WorkspaceFileEntry[];
  readReferencedFiles: () => Promise<PromptFileReference[]>;
}) => {
  if (referencedFilePreviews.length === 0) {
    return [];
  }

  ctx.setBusyStatus("正在读取引用文件...");
  return readReferencedFiles();
};

export const submitTavernAgentFlow = async ({
  event,
  submittedText,
  trigger = { type: "user" },
  ambiguousFileReferences,
  readReferencedFiles,
  referencedFilePreviews,
  unresolvedFileReferences,
  onCommitted,
}: SubmitTavernAgentFlowParams) => {
  event?.preventDefault();

  const ctx = useTavernRoomContext.getState();
  const { story, messages, busy, runtimeModel, setError } = ctx;
  const isSceneDrive = trigger.type === "scene_drive";
  const text = (isSceneDrive ? (trigger.directive ?? submittedText ?? "") : (submittedText ?? "")).trim();
  const workspacePath = ctx.workspacePath.trim();

  if (isTavernRoomBusy(busy)) {
    return;
  }

  if (!runtimeModel) {
    setError("请先在设置中选择模型，再进入酒馆对话。");
    return;
  }

  if (!story || story.characters.length === 0) {
    setError("当前房间还没有可回应的角色。");
    return;
  }

  if (!workspacePath) {
    setError("酒馆会话路径为空，请重新打开当前酒馆房间。");
    return;
  }

  if (!text && !isSceneDrive) {
    return;
  }

  const referenceError = validateSubmitReferences({
    unresolvedFileReferences,
    ambiguousFileReferences,
  });
  if (referenceError) {
    setError(referenceError);
    return;
  }

  let runtimeModelInput;
  try {
    runtimeModelInput = requireRuntimeModelInput(runtimeModel);
  } catch (error) {
    setError(getTavernAgentFlowErrorMessage(error));
    return;
  }

  const turnId = createTimestampId("turn");
  const userMessage = isSceneDrive
    ? null
    : createUserMessage({
        roomId: story.roomConfig.id,
        text,
        turnId,
        referencedFilePreviews,
      });

  try {
    beginSubmission({
      ctx,
      isSceneDrive,
    });

    const references = await readSubmitReferences({
      ctx,
      referencedFilePreviews,
      readReferencedFiles,
    });

    if (userMessage) {
      ctx.appendMessages(story.roomConfig.id, [userMessage]);
      ctx.setExecutionTraceAnchorMessageId(userMessage.id);
    }
    onCommitted?.();

    const result = await TavernAgentFlow.run({
      workspacePath,
      runtimeModel: runtimeModelInput,
      story,
      messages,
      references,
      currentUserText: text,
      trigger,
      turnId,
      maxSpeakers: story.roomConfig.settings.directorMaxSpeakers,
      onEvent: (event) => {
        if (event.type === "director_start") {
          ctx.setBusyStatus("导演正在调度角色...");
          ctx.setExecutionSteps([{ id: "director", label: "导演调度", status: "running" }]);
          return;
        }

        if (event.type === "director_done") {
          ctx.patchExecutionStep("director", {
            status: "done",
            detail: event.decision.reason,
          });
          event.decision.speakerIds.forEach((speakerId, index) => {
            const speaker = story.characters.find((character) => character.id === speakerId);
            ctx.upsertExecutionStep({
              id: `speaker-${speakerId}`,
              label: speaker ? `${speaker.name}回应` : `角色 ${index + 1} 回应`,
              status: "pending",
            });
          });
          return;
        }

        if (event.type === "director_narrator") {
          ctx.setBusyStatus("导演正在铺写旁白...");
          return;
        }

        if (event.type === "speaker_start") {
          ctx.setBusyStatus(`${event.character.name} 正在回应...`);
          ctx.patchExecutionStep(`speaker-${event.character.id}`, { status: "running" });
          return;
        }

        if (event.type === "speaker_done") {
          ctx.patchExecutionStep(`speaker-${event.character.id}`, {
            status: "done",
          });
        }
      },
    });

    if (result.messages.length > 0) {
      ctx.appendMessages(story.roomConfig.id, result.messages);
      const anchorMessage = userMessage ?? result.messages[0];
      if (anchorMessage) {
        ctx.setExecutionTraceAnchorMessageId(anchorMessage.id);
      }
    }
  } catch (error) {
    console.error("Failed to submit tavern agent flow", error);
    setError(`酒馆回应失败：${getTavernAgentFlowErrorMessage(error)}`);
    ctx.setExecutionSteps((steps) =>
      steps.map((step) => (step.status === "running" ? { ...step, status: "error" } : step)),
    );
  } finally {
    ctx.setBusy(createIdleTavernRoomBusyState());
  }
};
