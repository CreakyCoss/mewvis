import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { TavernRoomContextValue } from "@/features/pages/taverns/room/context";
import { createTavernMessage } from "@/features/pages/taverns/tavern/message";
import {
  isTavernCharacterAvailableForSpeech,
  isTavernFixedOrderPhase,
  orderTavernRoundParticipants,
  orderTavernRoundSpeakers,
} from "@/features/pages/taverns/tavern/core";
import { resolveTavernCharacterModel } from "@/features/pages/taverns/tavern/runtime/agent";
import { runTavernManagedUserReply } from "@/features/pages/taverns/tavern/runtime/assistants";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernAssetDraft, TavernCharacter, TavernReplyOption } from "@/features/pages/taverns/manage/model";

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

export const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

export const getRoomActiveSceneId = (room: TavernRoom) => room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

export const getRoomActiveSceneInstanceId = (room: TavernRoom) =>
  room.activeSceneInstanceId ?? getRoomActiveSceneId(room);

export const shouldAutoExtractAssets = (room: TavernRoom, messagesAfterUser: TavernMessage[]) => {
  if (!room.settings.autoAssetExtractionEnabled) {
    return false;
  }

  if (room.assetDrafts.length >= room.settings.maxAssetDrafts) {
    return false;
  }

  const userTurnCount = messagesAfterUser.filter((message) => message.role === "user").length;
  return userTurnCount > 0 && userTurnCount % room.settings.assetExtractionIntervalTurns === 0;
};

export const shouldAutoTrackProgress = (room: TavernRoom, messagesAfterUser: TavernMessage[]) => {
  if (
    !room.settings.statusTracking.enabled ||
    !room.progressTracker.enabled ||
    room.progressTracker.mode === "manual" ||
    room.statusDefinitions.length === 0 ||
    room.statusRules.length === 0
  ) {
    return false;
  }

  if (room.progressTracker.mode === "afterTurn") {
    return true;
  }

  const interval = Math.max(1, room.progressTracker.intervalTurns);
  const userTurnCount = messagesAfterUser.filter((message) => message.role === "user").length;
  return userTurnCount > 0 && userTurnCount % interval === 0;
};

export const shouldCompactCharacterKnowledgeAfterTurn = (
  room: TavernRoom,
  messages: TavernMessage[],
  characterId: string,
) => {
  const interval = room.settings.agentKnowledgeCompactIntervalTurns;
  if (!interval || interval <= 0) {
    return false;
  }

  const completedTurns = messages.filter(
    (message) =>
      message.role === "character" &&
      message.characterId === characterId &&
      message.status !== "streaming" &&
      message.status !== "error" &&
      message.content.trim(),
  ).length;
  return completedTurns > 0 && completedTurns % interval === 0;
};

export type TavernPendingInteractions = NonNullable<TavernRoom["pendingInteractions"]>;
export type RequireSpeakerRuntimeModel = (speaker: TavernCharacter) => RuntimeModelOption;
export type TurnTriggerType = "user" | "scene_drive";

export type TurnMode = {
  isManagedMode: boolean;
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
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
  shouldRunAssetExtraction: boolean;
  shouldRunProgressTracking: boolean;
  shouldShowProgressTrace: boolean;
};

export type ActiveReplyRef = {
  message: TavernMessage | null;
  text: string;
};

export const resolveTurnMode = (isManagedModeEnabled: boolean, triggerType: TurnTriggerType = "user"): TurnMode => {
  const isSceneDriveMode = triggerType === "scene_drive";
  const isManagedMode = isManagedModeEnabled && !isSceneDriveMode;

  return {
    isManagedMode,
    isSceneDriveMode,
    isDirectorLikeMode: true,
  };
};

export const resolveSubmitSpeakerPlan = ({
  room,
  characters,
  activeCharacter,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  activeCharacter: TavernCharacter | null;
}): SubmitSpeakerPlan => {
  const fixedOrderSettings = room.settings.directorScheduling.fixedOrder;
  const fixedOrderParticipants =
    isTavernFixedOrderPhase(room) && fixedOrderSettings.includeUser
      ? orderTavernRoundParticipants({
          room,
          characters,
          activeCharacterId: activeCharacter?.id,
          includeUser: true,
          userPosition: fixedOrderSettings.userPosition,
          userPersonaName: room.userPersonaName,
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
          room,
          characters,
          activeCharacterId: activeCharacter?.id,
        });
  const availableActiveCharacter =
    activeCharacter && isTavernCharacterAvailableForSpeech(room, activeCharacter)
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

export const getReferencePreviewsForSubmit = ({
  submittedText,
  referencedFilePreviews,
}: {
  submittedText?: string;
  referencedFilePreviews: WorkspaceFileEntry[];
}) => (submittedText === undefined ? referencedFilePreviews : []);

export const validateSubmitReferences = ({
  submittedText,
  unresolvedFileReferences,
  ambiguousFileReferences,
}: {
  submittedText?: string;
  unresolvedFileReferences: Array<{ token: string }>;
  ambiguousFileReferences: Array<{ token: string }>;
}) => {
  if (submittedText !== undefined) {
    return "";
  }

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
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  mode: TurnMode;
}) => {
  if (mode.isManagedMode) {
    ctx.setIsManagedAutoRunStarted(true);
  }

  ctx.setIsSending(true);
  ctx.setError("");
  ctx.setReplySuggestions([]);
  ctx.patchRoom(room.id, {
    replyOptions: [],
  });
  ctx.setTurnStatus(
    mode.isSceneDriveMode
      ? "导演正在自推动场景..."
      : mode.isManagedMode
        ? "导演正在调度你的回复..."
        : mode.isDirectorLikeMode
          ? "导演正在接收你的消息..."
          : "正在发送消息...",
  );
};

export const abortTurnSubmission = ({ ctx, mode }: { ctx: TavernRoomContextValue; mode: TurnMode }) => {
  if (mode.isManagedMode) {
    ctx.setIsManagedAutoRunStarted(false);
  }
  ctx.setIsSending(false);
  ctx.setTurnStatus("");
};

export const readTurnReferences = async ({
  ctx,
  referencedFilePreviews,
  readReferencedFiles,
}: {
  ctx: TavernRoomContextValue;
  referencedFilePreviews: WorkspaceFileEntry[];
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
}) => {
  if (referencedFilePreviews.length === 0) {
    return [];
  }

  ctx.setTurnStatus("正在读取引用文件...");
  return readReferencedFiles();
};

export const resolveManagedUserText = async ({
  ctx,
  room,
  runtimeModel,
  draftText,
  mode,
  storyContext,
}: {
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  runtimeModel: RuntimeModelOption;
  draftText: string;
  mode: TurnMode;
  storyContext?: TavernStoryContextPackage;
}) => {
  if (!mode.isManagedMode) {
    return draftText;
  }

  ctx.setTurnStatus("导演正在代你生成本轮回复...");
  return runTavernManagedUserReply({
    workspacePath: ctx.workspace.path,
    runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
    room,
    characters: ctx.roomCharacters,
    messages: ctx.roomMessages,
    currentDraft: draftText,
    storyContext,
  });
};

export const createUserTurnMessage = ({
  room,
  text,
  referencedFilePreviews,
  selectedReplyOption,
}: {
  room: TavernRoom;
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  selectedReplyOption?: TavernReplyOption;
}) =>
  createTavernMessage({
    roomId: room.id,
    sceneId: room.activeSceneId,
    sceneInstanceId: getRoomActiveSceneInstanceId(room),
    role: "user",
    presentationProfileId: room.presentation?.profileId,
    content: text,
    status: "done",
    referencedFiles: referencedFilePreviews.map((file) => ({ path: file.path })),
    targetCharacterIds: selectedReplyOption?.targetCharacterIds,
    respondsToInteractionIds: selectedReplyOption?.respondsToInteractionId
      ? [selectedReplyOption.respondsToInteractionId]
      : undefined,
  });

export const createSceneDriveTurnAnchorMessage = ({ room, directive }: { room: TavernRoom; directive: string }) =>
  createTavernMessage({
    roomId: room.id,
    sceneId: room.activeSceneId,
    sceneInstanceId: getRoomActiveSceneInstanceId(room),
    role: "narrator",
    presentationProfileId: room.presentation?.profileId,
    content: directive.trim() ? `场景自推动：${directive.trim()}` : "场景自推动",
    status: "done",
  });

export const createInitialTurnRuntime = ({
  room,
  roomMessages,
  turnAnchorMessage,
  visibleUserMessage,
  mode,
}: {
  room: TavernRoom;
  roomMessages: TavernMessage[];
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
  mode: TurnMode;
}): TurnRuntimeState => {
  const runtimeMessages = visibleUserMessage ? [...roomMessages, visibleUserMessage] : [...roomMessages];
  const turnMessages = visibleUserMessage ? [visibleUserMessage] : [];

  return {
    runtimeRoom: room,
    runtimeMessages,
    turnMessages,
    turnAnchorMessage,
    visibleUserMessage,
    shouldRunAssetExtraction: shouldAutoExtractAssets(room, runtimeMessages),
    shouldRunProgressTracking: shouldAutoTrackProgress(room, runtimeMessages),
    shouldShowProgressTrace: room.settings.showExecutionTrace || mode.isDirectorLikeMode,
  };
};

export const prepareTurnTraceAndUserMessage = ({
  ctx,
  room,
  turnAnchorMessage,
  visibleUserMessage,
  references,
  runtime,
  mode,
}: {
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  turnAnchorMessage: TavernMessage;
  visibleUserMessage: TavernMessage | null;
  references: TavernReferencedFile[];
  runtime: TurnRuntimeState;
  mode: TurnMode;
}) => {
  // 提交流程真正开始后才清空输入和落地用户消息，保证前置失败不会改动页面。
  ctx.setTurnStatus(
    mode.isSceneDriveMode
      ? "导演正在准备自推动轮次..."
      : mode.isDirectorLikeMode
        ? "导演正在准备角色状态..."
        : "正在准备对话...",
  );
  if (runtime.shouldShowProgressTrace) {
    ctx.setExecutionTraceAnchorMessageId(visibleUserMessage?.id ?? turnAnchorMessage.id);
    ctx.resetExecutionTrace([
      {
        id: "context",
        label: mode.isSceneDriveMode ? "准备自推" : "准备对话",
        detail: mode.isSceneDriveMode ? "读取本轮导演方向与引用文件。" : "读取本轮用户输入与引用文件。",
        status: "running",
      },
    ]);
  } else {
    ctx.setExecutionTraceAnchorMessageId("");
    ctx.resetExecutionTrace([]);
  }
  ctx.setDraft("");
  ctx.setDraftCursor(0);
  if (visibleUserMessage) {
    ctx.appendMessagesToRoom(room.id, [visibleUserMessage]);
  }
  ctx.patchExecutionStep("context", {
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
  mode,
}: {
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  error: unknown;
  activeReplyRef: ActiveReplyRef;
  mode: TurnMode;
}) => {
  const message = getErrorMessage(error);
  ctx.setExecutionSteps((current) =>
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
    ctx.appendMessagesToRoom(room.id, [
      createTavernMessage({
        roomId: room.id,
        role: "narrator",
        content: `酒馆回应失败：${message}`,
        status: "error",
      }),
    ]);
  }
  ctx.setError(message);
  if (mode.isManagedMode) {
    ctx.setIsManagedAutoRunStarted(false);
  }
};
