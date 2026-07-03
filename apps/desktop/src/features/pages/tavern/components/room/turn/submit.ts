import type { FormEvent } from "react";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { TavernPageContextValue } from "../../context";
import {
  loadTavernStoryState,
  resolveTavernRuntimeStoryContextPackage,
} from "../../../adapters/story";
import type {
  TavernReferencedFile,
  TavernReplyOption,
} from "../../../types";
import {
  abortTurnSubmission,
  beginTurnSubmission,
  createInitialTurnRuntime,
  createSceneDriveTurnAnchorMessage,
  createSpeakerRuntimeModelResolver,
  createUserTurnMessage,
  findMissingSpeakerModel,
  getErrorMessage,
  getReferencePreviewsForSubmit,
  handleTurnFailure,
  prepareTurnTraceAndUserMessage,
  readTurnReferences,
  resolveManagedUserText,
  resolveSubmitSpeakerPlan,
  resolveTurnMode,
  runAssetExtractionStep,
  runDirectorLoopTurn,
  runProgressTrackingStep,
  runSpeakerReplyFlow,
  shouldRunTavernDirectorLoopWorkflow,
  syncOpenPendingInteractions,
  validateSubmitReferences,
  type ActiveReplyRef,
  type TurnTriggerType,
} from "./submit-flow";

export type SubmitRoomTurnTrigger = {
  type: TurnTriggerType;
  directive?: string;
};

type SubmitRoomTurnParams = {
  ctx: TavernPageContextValue;
  event?: FormEvent;
  submittedText?: string;
  selectedReplyOption?: TavernReplyOption;
  trigger?: SubmitRoomTurnTrigger;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: Array<{ token: string }>;
};

export const submitRoomTurn = async ({
  ctx,
  event,
  submittedText,
  selectedReplyOption,
  trigger = { type: "user" },
  ambiguousFileReferences,
  readReferencedFiles,
  referencedFilePreviews,
  unresolvedFileReferences,
}: SubmitRoomTurnParams) => {
  event?.preventDefault();

  const {
    activeCharacter,
    activeRoom,
    draft,
    isManagedModeEnabled,
    isSending,
    roomCharacters,
    roomMessages,
    runtimeModel,
    setError,
  } = ctx;
  const triggerType = trigger.type;
  const draftText = (
    trigger.type === "scene_drive"
      ? trigger.directive ?? submittedText ?? draft
      : submittedText ?? draft
  ).trim();

  // 1. 前置校验只做“能不能提交”的判断，不改动房间数据。
  if (isSending) {
    return;
  }

  if (!runtimeModel) {
    setError("请先在设置中选择模型，再进入酒馆对话。");
    return;
  }

  if (!activeRoom) {
    setError("当前房间还没有可回应的角色。");
    return;
  }

  const mode = resolveTurnMode(isManagedModeEnabled, triggerType);
  if (!draftText && !mode.isManagedMode && !mode.isSceneDriveMode) {
    return;
  }

  const speakerPlan = resolveSubmitSpeakerPlan({
    room: activeRoom,
    characters: roomCharacters,
    activeCharacter,
  });
  if (
    speakerPlan.candidateSpeakers.length === 0 &&
    !speakerPlan.canSubmitFixedOrderUserOnlyTurn
  ) {
    setError("当前房间还没有可回应的角色。");
    return;
  }

  const missingModelSpeaker = findMissingSpeakerModel(
    speakerPlan.candidateSpeakers,
    runtimeModel,
  );
  if (missingModelSpeaker) {
    setError(`角色 ${missingModelSpeaker.name} 还没有可用模型。`);
    return;
  }

  const referenceError = validateSubmitReferences({
    submittedText,
    unresolvedFileReferences,
    ambiguousFileReferences,
  });
  if (referenceError) {
    setError(referenceError);
    return;
  }

  const currentReferencedFilePreviews = getReferencePreviewsForSubmit({
    submittedText,
    referencedFilePreviews,
  });
  const requireSpeakerRuntimeModel = createSpeakerRuntimeModelResolver(runtimeModel);

  beginTurnSubmission({
    ctx,
    room: activeRoom,
    mode,
  });

  // 2. 外部输入准备阶段：引用文件和全托管回复都可能失败，失败时只复位忙碌态。
  let references: TavernReferencedFile[] = [];
  try {
    references = await readTurnReferences({
      ctx,
      referencedFilePreviews: currentReferencedFilePreviews,
      readReferencedFiles,
    });
  } catch (readError) {
    setError(`读取引用文件失败：${getErrorMessage(readError)}`);
    abortTurnSubmission({ ctx, mode });
    return;
  }

  let text = draftText;
  const storyState = await loadTavernStoryState(activeRoom.storyBinding?.storyId).catch(() => null);
  const preliminaryStoryContext = resolveTavernRuntimeStoryContextPackage({
    room: activeRoom,
    characters: roomCharacters,
    storyState,
  });
  try {
    text = await resolveManagedUserText({
      ctx,
      room: activeRoom,
      runtimeModel,
      draftText,
      mode,
      storyContext: preliminaryStoryContext,
    });
  } catch (managedError) {
    setError(`全托管生成回复失败：${getErrorMessage(managedError)}`);
    abortTurnSubmission({ ctx, mode });
    return;
  }

  if (!text.trim() && !mode.isSceneDriveMode) {
    setError("全托管没有生成可发送的回复，请重试或输入方向提示。");
    abortTurnSubmission({ ctx, mode });
    return;
  }

  const visibleUserMessage = mode.isSceneDriveMode
    ? null
    : createUserTurnMessage({
        room: activeRoom,
        text,
        referencedFilePreviews: currentReferencedFilePreviews,
        selectedReplyOption,
      });
  const turnAnchorMessage = visibleUserMessage ?? createSceneDriveTurnAnchorMessage({
    room: activeRoom,
    directive: text,
  });
  let runtime = createInitialTurnRuntime({
    room: activeRoom,
    roomMessages,
    turnAnchorMessage,
    visibleUserMessage,
    mode,
  });
  const activeReplyRef: ActiveReplyRef = {
    message: null,
    text: "",
  };
  const storyContext = resolveTavernRuntimeStoryContextPackage({
    room: runtime.runtimeRoom,
    characters: roomCharacters,
    storyState,
  });

  try {
    // 3. 本轮正式入队后，后续流程都围绕 runtime 这份运行时快照向前推进。
    prepareTurnTraceAndUserMessage({
      ctx,
      room: activeRoom,
      turnAnchorMessage,
      visibleUserMessage,
      references,
      runtime,
      mode,
    });

    let speakers = speakerPlan.candidateSpeakers;
    let directorReason = "";
    let directorNonverbalReplyIds: string[] = [];
    let turnNarratorTexts: string[] = [];
    const shouldUseDirectorWorkflow = shouldRunTavernDirectorLoopWorkflow({
      availableRoomCharacters: speakerPlan.availableRoomCharacters,
      mode,
      room: runtime.runtimeRoom,
    });

    if (shouldUseDirectorWorkflow) {
      const directorLoopTurn = await runDirectorLoopTurn({
        activeReplyRef,
        availableActiveCharacter: speakerPlan.availableActiveCharacter,
        availableRoomCharacters: speakerPlan.availableRoomCharacters,
        ctx,
        mode,
        references,
        room: activeRoom,
        runtimeMessages: runtime.runtimeMessages,
        runtimeModel,
        runtimeRoom: runtime.runtimeRoom,
        selectedReplyOption,
        storyContext,
        text,
        turnMessages: runtime.turnMessages,
        userMessage: turnAnchorMessage,
      });
      directorReason = directorLoopTurn.directorReason;
      directorNonverbalReplyIds = directorLoopTurn.directorNonverbalReplyIds;
      turnNarratorTexts = directorLoopTurn.turnNarratorTexts;
      runtime = {
        ...runtime,
        runtimeRoom: directorLoopTurn.runtimeRoom,
        runtimeMessages: directorLoopTurn.runtimeMessages,
        turnMessages: directorLoopTurn.turnMessages,
      };
      syncOpenPendingInteractions({
        ctx,
        room: activeRoom,
        openPendingInteractions: directorLoopTurn.openPendingInteractions,
      });
    }

    if (!shouldUseDirectorWorkflow) {
      const speakerTurn = await runSpeakerReplyFlow({
        ctx,
        room: activeRoom,
        runtimeRoom: runtime.runtimeRoom,
        runtimeMessages: runtime.runtimeMessages,
        turnMessages: runtime.turnMessages,
        userMessage: turnAnchorMessage,
        text,
        references,
        selectedReplyOption,
        speakers,
        availableRoomCharacters: speakerPlan.availableRoomCharacters,
        mode,
        directorReason,
        directorNonverbalReplyIds,
        turnNarratorTexts,
        requireSpeakerRuntimeModel,
        activeReplyRef,
        storyContext,
      });
      runtime = {
        ...runtime,
        runtimeMessages: speakerTurn.runtimeMessages,
        turnMessages: speakerTurn.turnMessages,
      };
      syncOpenPendingInteractions({
        ctx,
        room: activeRoom,
        openPendingInteractions: speakerTurn.openPendingInteractions,
      });
    }

    // 4. 本轮回复完成后的增强流程互相独立，单个失败不会回滚已经发送的消息。
    if (runtime.shouldRunProgressTracking) {
      runtime = {
        ...runtime,
        runtimeRoom: await runProgressTrackingStep({
          ctx,
          room: activeRoom,
          runtimeRoom: runtime.runtimeRoom,
          runtimeMessages: runtime.runtimeMessages,
          turnMessages: runtime.turnMessages,
          references,
          text,
          userMessage: turnAnchorMessage,
          runtimeModel,
          shouldShowProgressTrace: runtime.shouldShowProgressTrace,
          storyContext,
        }),
      };
    }

    if (runtime.shouldRunAssetExtraction) {
      await runAssetExtractionStep({
        ctx,
        room: activeRoom,
        runtimeRoom: runtime.runtimeRoom,
        runtimeMessages: runtime.runtimeMessages,
        turnMessages: runtime.turnMessages,
        references,
        text,
        runtimeModel,
        mode,
        storyContext,
      });
    }
  } catch (runError) {
    handleTurnFailure({
      ctx,
      room: activeRoom,
      error: runError,
      activeReplyRef,
      mode,
    });
  } finally {
    ctx.setIsSending(false);
    ctx.setTurnStatus("");
  }
};
