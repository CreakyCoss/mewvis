import type { FormEvent } from "react";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { TavernReplyOption } from "@/features/pages/taverns/manage/model";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  useTavernRoomContext,
  type TavernRoomStoreState,
} from "@/features/pages/taverns/room/context";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import { createTavernTextMessageBody } from "../model/message-body";
import { runTavernAgentFlow } from ".";
import type { TavernAgentFlowTrigger } from "./types";

export type SubmitTavernAgentFlowTrigger = TavernAgentFlowTrigger;

type SubmitTavernAgentFlowParams = {
  event?: FormEvent;
  submittedText?: string;
  selectedReplyOption?: TavernReplyOption;
  trigger?: SubmitTavernAgentFlowTrigger;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
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
  selectedReplyOption,
}: {
  roomId: string;
  text: string;
  turnId: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  selectedReplyOption?: TavernReplyOption;
}): TavernMessage => ({
  id: createTimestampId("msg"),
  roomId,
  turnId,
  kind: "user_text",
  role: "user",
  body: createTavernTextMessageBody(text),
  targetCharacterIds: selectedReplyOption?.targetCharacterIds,
  referencedFiles: referencedFilePreviews.map((file) => ({ path: file.path })),
  createdAt: getCurrentTimestamp(),
  status: "done",
});

const beginSubmission = ({
  ctx,
  roomId,
  isSceneDrive,
}: {
  ctx: TavernRoomStoreState;
  roomId: string;
  isSceneDrive: boolean;
}) => {
  ctx.setBusy({
    kind: "sending",
    status: isSceneDrive ? "导演正在自推动场景..." : "导演正在调度角色...",
  });
  ctx.setError("");
  ctx.resetExecutionTrace([
    {
      id: "director",
      label: "导演调度",
      status: "pending",
    },
  ]);
  ctx.patchRoom(roomId, (runtime) => {
    const updatedAt = getCurrentTimestamp();
    return {
      ...runtime,
      identity: {
        ...runtime.identity,
        updatedAt,
      },
      config: {
        room: {
          ...runtime.config.room,
          updatedAt,
        },
      },
      scene: {
        ...runtime.scene,
        replyOptions: [],
        updatedAt,
      },
    };
  });
};

const readSubmitReferences = async ({
  ctx,
  referencedFilePreviews,
  readReferencedFiles,
}: {
  ctx: TavernRoomStoreState;
  referencedFilePreviews: WorkspaceFileEntry[];
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
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
  selectedReplyOption,
  trigger = { type: "user" },
  ambiguousFileReferences,
  readReferencedFiles,
  referencedFilePreviews,
  unresolvedFileReferences,
  onCommitted,
}: SubmitTavernAgentFlowParams) => {
  event?.preventDefault();

  const ctx = useTavernRoomContext.getState();
  const { activeRoom, busy, roomCharacters, roomMessages, runtimeModel, setError } = ctx;
  const isSceneDrive = trigger.type === "scene_drive";
  const text = (isSceneDrive ? (trigger.directive ?? submittedText ?? "") : (submittedText ?? "")).trim();
  const workspacePath = ctx.tavernWorkspacePath.trim() || ctx.workspace.path.trim();

  if (isTavernRoomBusy(busy)) {
    return;
  }

  if (!runtimeModel) {
    setError("请先在设置中选择模型，再进入酒馆对话。");
    return;
  }

  if (!activeRoom || roomCharacters.length === 0) {
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
  const previousMessages = roomMessages;
  const userMessage =
    isSceneDrive
      ? null
      : createUserMessage({
          roomId: activeRoom.identity.id,
          text,
          turnId,
          referencedFilePreviews,
          selectedReplyOption,
        });

  try {
    beginSubmission({
      ctx,
      roomId: activeRoom.identity.id,
      isSceneDrive,
    });

    const references = await readSubmitReferences({
      ctx,
      referencedFilePreviews,
      readReferencedFiles,
    });

    if (userMessage) {
      ctx.appendMessagesToRoom(activeRoom.identity.id, [userMessage]);
      ctx.setExecutionTraceAnchorMessageId(userMessage.id);
    }
    onCommitted?.();

    const result = await runTavernAgentFlow({
      workspacePath,
      runtimeModel: runtimeModelInput,
      room: activeRoom,
      characters: roomCharacters,
      messages: previousMessages,
      references,
      currentUserText: text,
      trigger,
      turnId,
      selectedCharacterIds: selectedReplyOption?.targetCharacterIds,
      maxSpeakers: activeRoom.presentation.settings.directorMaxSpeakers,
      onEvent: (event) => {
        if (event.type === "director_start") {
          ctx.setBusyStatus("导演正在调度角色...");
          ctx.resetExecutionTrace([{ id: "director", label: "导演调度", status: "running" }]);
          return;
        }

        if (event.type === "director_done") {
          ctx.patchExecutionStep("director", {
            status: "done",
            detail: event.decision.reason,
          });
          event.decision.speakerIds.forEach((speakerId, index) => {
            const speaker = roomCharacters.find((character) => character.id === speakerId);
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
      ctx.appendMessagesToRoom(activeRoom.identity.id, result.messages);
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
