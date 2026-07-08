import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { TavernRoomStoreState } from "@/features/pages/taverns/room/context";
import { createTavernMessage } from "@/features/pages/taverns/room/message/domain/factory";
import {
  isTavernCharacterAvailableForSpeech,
  orderTavernRoundParticipants,
  orderTavernRoundSpeakers,
} from "@/features/pages/taverns/tavern/core/turn-order";
import { isTavernFixedOrderPhase } from "@/features/pages/taverns/tavern/core/director-scheduling";
import { resolveTavernCharacterModel } from "@/features/pages/taverns/tavern/runtime/agent/model-selection";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter, TavernReplyOption } from "@/features/pages/taverns/manage/model";
import {
  selectTavernRuntimeActiveSceneFields,
  selectTavernRuntimeActiveSceneId,
  selectTavernRuntimeActiveSceneInstanceId,
} from "@/features/pages/taverns/room/runtime/accessors";
import { patchTavernRuntimeActiveSceneFields } from "@/features/pages/taverns/room/runtime/mutations";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

export const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

export const getRoomActiveSceneId = (room: TavernRoomRuntime) => selectTavernRuntimeActiveSceneId(room);

export const getRoomActiveSceneInstanceId = (room: TavernRoomRuntime) => selectTavernRuntimeActiveSceneInstanceId(room);

export type TavernPendingInteractions = ReturnType<typeof selectTavernRuntimeActiveSceneFields>["pendingInteractions"];
export type RequireSpeakerRuntimeModel = (speaker: TavernCharacter) => RuntimeModelOption;
export type TurnTriggerType = "user" | "scene_drive";

export type TurnMode = {
  isSceneDriveMode: boolean;
  isDirectorLikeMode: boolean;
};

export type SubmitSpeakerPlan = {
  availableRoomCharacters: TavernCharacter[];
  availableActiveCharacter: TavernCharacter | null;
  candidateSpeakers: TavernCharacter[];
  canSubmitFixedOrderUserOnlyTurn: boolean;
};

export type TurnRuntimeState = {
  runtimeRoom: TavernRoomRuntime;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
};

export type ActiveReplyRef = {
  message: TavernMessage | null;
  text: string;
};

export const syncOpenPendingInteractions = ({
  ctx,
  room,
  openPendingInteractions,
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoomRuntime;
  openPendingInteractions: TavernPendingInteractions;
}) => {
  ctx.patchRoom(room.identity.id, (runtime) =>
    patchTavernRuntimeActiveSceneFields(runtime, {
      pendingInteractions: openPendingInteractions,
    }),
  );
};

export const resolveTurnMode = (triggerType: TurnTriggerType = "user"): TurnMode => {
  const isSceneDriveMode = triggerType === "scene_drive";

  return {
    isSceneDriveMode,
    isDirectorLikeMode: true,
  };
};

export const resolveSubmitSpeakerPlan = ({
  room,
  characters,
  activeCharacter,
}: {
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  activeCharacter: TavernCharacter | null;
}): SubmitSpeakerPlan => {
  const settings = room.presentation.settings;
  const fixedOrderSettings = settings.directorScheduling.fixedOrder;
  const fixedOrderParticipants =
    isTavernFixedOrderPhase(settings) && fixedOrderSettings.includeUser
      ? orderTavernRoundParticipants({
          settings,
          characters,
          activeCharacterId: activeCharacter?.id,
          includeUser: true,
          userPosition: fixedOrderSettings.userPosition,
          userPersonaName: room.user.personaName,
        })
      : [];
  const fixedOrderUserIndex = fixedOrderParticipants.findIndex((participant) => participant.type === "user");
  const fixedOrderCharactersAfterUser =
    fixedOrderUserIndex >= 0
      ? fixedOrderParticipants
          .slice(fixedOrderUserIndex + 1)
          .flatMap((participant) => (participant.type === "character" ? [participant.character] : []))
      : [];
  const availableRoomCharacters =
    fixedOrderUserIndex >= 0
      ? fixedOrderCharactersAfterUser
      : orderTavernRoundSpeakers({
          settings,
          characters,
          activeCharacterId: activeCharacter?.id,
        });
  const availableActiveCharacter =
    activeCharacter && isTavernCharacterAvailableForSpeech(settings, activeCharacter)
      ? activeCharacter
      : (availableRoomCharacters[0] ?? null);
  const candidateSpeakers = availableRoomCharacters;

  return {
    availableRoomCharacters,
    availableActiveCharacter,
    candidateSpeakers,
    canSubmitFixedOrderUserOnlyTurn: fixedOrderUserIndex >= 0 && fixedOrderCharactersAfterUser.length === 0,
  };
};

export const findMissingSpeakerModel = (speakers: TavernCharacter[], runtimeModel: RuntimeModelOption) => {
  const speakerModels = speakers.map((speaker) => ({
    speaker,
    resolvedModel: resolveTavernCharacterModel({
      fallbackRuntimeModel: runtimeModel,
    }),
  }));
  return speakerModels.find((item) => !item.resolvedModel)?.speaker ?? null;
};

export const createSpeakerRuntimeModelResolver =
  (runtimeModel: RuntimeModelOption): RequireSpeakerRuntimeModel =>
  (speaker) => {
    const resolvedModel = resolveTavernCharacterModel({
      fallbackRuntimeModel: runtimeModel,
    });
    if (!resolvedModel) {
      throw new Error(`角色 ${speaker.name} 还没有可用模型。`);
    }
    return resolvedModel.runtimeModel;
  };

export const validateSubmitReferences = ({
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

export const beginTurnSubmission = ({
  ctx,
  room,
  mode,
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoomRuntime;
  mode: TurnMode;
}) => {
  ctx.setBusy({
    kind: "sending",
    status: mode.isSceneDriveMode
      ? "导演正在自推动场景..."
      : mode.isDirectorLikeMode
        ? "导演正在接收你的消息..."
        : "正在发送消息...",
  });
  ctx.setError("");
  ctx.patchRoom(room.identity.id, (runtime) => patchTavernRuntimeActiveSceneFields(runtime, { replyOptions: [] }));
};

export const readTurnReferences = async ({
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

export const createUserTurnMessage = ({
  room,
  text,
  referencedFilePreviews,
  selectedReplyOption,
}: {
  room: TavernRoomRuntime;
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  selectedReplyOption?: TavernReplyOption;
}) =>
  createTavernMessage({
    roomId: room.identity.id,
    sceneId: getRoomActiveSceneId(room),
    sceneInstanceId: getRoomActiveSceneInstanceId(room),
    role: "user",
    presentationProfileId: room.presentation.profile?.profileId,
    content: text,
    status: "done",
    referencedFiles: referencedFilePreviews.map((file) => ({ path: file.path })),
    targetCharacterIds: selectedReplyOption?.targetCharacterIds,
    respondsToInteractionIds: selectedReplyOption?.respondsToInteractionId
      ? [selectedReplyOption.respondsToInteractionId]
      : undefined,
  });

export const createSceneDriveTurnAnchorMessage = ({
  room,
  directive,
}: {
  room: TavernRoomRuntime;
  directive: string;
}) =>
  createTavernMessage({
    roomId: room.identity.id,
    sceneId: getRoomActiveSceneId(room),
    sceneInstanceId: getRoomActiveSceneInstanceId(room),
    role: "narrator",
    presentationProfileId: room.presentation.profile?.profileId,
    content: directive.trim() ? `场景自推动：${directive.trim()}` : "场景自推动",
    status: "done",
  });

export const createInitialTurnRuntime = ({
  runtimeRoom,
  roomMessages,
  turnAnchorMessage,
  visibleUserMessage,
}: {
  runtimeRoom: TavernRoomRuntime | null;
  roomMessages: TavernMessage[];
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
}): TurnRuntimeState => {
  if (!runtimeRoom) {
    throw new Error("当前房间运行状态尚未初始化。");
  }

  const runtimeMessages = visibleUserMessage ? [...roomMessages, visibleUserMessage] : [...roomMessages];
  const turnMessages = visibleUserMessage ? [visibleUserMessage] : [];

  return {
    runtimeRoom,
    runtimeMessages,
    turnMessages,
    turnAnchorMessage,
    visibleUserMessage,
  };
};

export const prepareTurnUserMessage = ({
  ctx,
  room,
  turnAnchorMessage,
  visibleUserMessage,
  references,
  mode,
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoomRuntime;
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
  references: TavernReferencedFile[];
  mode: TurnMode;
}) => {
  // 提交流程真正开始后才落地用户消息，保证前置失败不会改动页面。
  ctx.setBusyStatus(
    mode.isSceneDriveMode
      ? "导演正在准备自推动轮次..."
      : mode.isDirectorLikeMode
        ? "导演正在准备角色状态..."
        : "正在准备对话...",
  );
  if (mode.isDirectorLikeMode) {
    ctx.setExecutionTraceAnchorMessageId?.(visibleUserMessage?.id ?? turnAnchorMessage.id);
    ctx.resetExecutionTrace?.([
      {
        id: "context",
        label: mode.isSceneDriveMode ? "准备自推" : "准备对话",
        detail: mode.isSceneDriveMode ? "读取本轮导演方向与引用文件。" : "读取本轮用户输入与引用文件。",
        status: "running",
      },
    ]);
  } else {
    ctx.setExecutionTraceAnchorMessageId?.("");
    ctx.resetExecutionTrace?.([]);
  }
  if (visibleUserMessage) {
    ctx.appendMessagesToRoom(room.identity.id, [visibleUserMessage]);
  }
  ctx.patchExecutionStep?.("context", {
    status: "done",
    detail: references.length
      ? `已加载 ${references.length} 个引用文件。`
      : mode.isSceneDriveMode
        ? "已准备自推动轮次。"
        : "已准备本轮对话。",
  });
};

export const handleTurnFailure = ({
  ctx,
  room,
  error,
  activeReplyRef,
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoomRuntime;
  error: unknown;
  activeReplyRef: ActiveReplyRef;
}) => {
  const message = getErrorMessage(error);
  ctx.setExecutionSteps?.((current) =>
    current.map((step) => (step.status === "running" ? { ...step, status: "error", detail: message } : step)),
  );
  if (activeReplyRef.message) {
    ctx.patchMessage(activeReplyRef.message.id, {
      content: activeReplyRef.text.trim()
        ? `${activeReplyRef.text}\n\n酒馆回应失败：${message}`
        : `酒馆回应失败：${message}`,
      status: "error",
    });
  } else {
    ctx.appendMessagesToRoom(room.identity.id, [
      createTavernMessage({
        roomId: room.identity.id,
        role: "narrator",
        content: `酒馆回应失败：${message}`,
        status: "error",
      }),
    ]);
  }
  ctx.setError(message);
};
