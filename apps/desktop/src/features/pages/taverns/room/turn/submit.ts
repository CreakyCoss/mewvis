import type { FormEvent } from "react";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import {
  createIdleTavernRoomBusyState,
  isTavernRoomBusy,
  useTavernRoomContext,
} from "@/features/pages/taverns/room/context";
import { buildTavernStoryContextPackage } from "@/features/pages/taverns/room/story-context";
import type { TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernReplyOption } from "@/features/pages/taverns/manage/model";
import {
  beginTurnSubmission,
  createInitialTurnRuntime,
  createSceneDriveTurnAnchorMessage,
  createSpeakerRuntimeModelResolver,
  createUserTurnMessage,
  findMissingSpeakerModel,
  getErrorMessage,
  handleTurnFailure,
  prepareTurnUserMessage,
  readTurnReferences,
  resolveSubmitSpeakerPlan,
  resolveTurnMode,
  runDirectorLoopTurn,
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
  event?: FormEvent;
  submittedText?: string;
  selectedReplyOption?: TavernReplyOption;
  trigger?: SubmitRoomTurnTrigger;
  ambiguousFileReferences: Array<{ token: string }>;
  readReferencedFiles: () => Promise<TavernReferencedFile[]>;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: Array<{ token: string }>;
  onCommitted?: () => void;
};

export const submitRoomTurn = async ({
  event,
  submittedText,
  selectedReplyOption,
  trigger = { type: "user" },
  ambiguousFileReferences,
  readReferencedFiles,
  referencedFilePreviews,
  unresolvedFileReferences,
  onCommitted,
}: SubmitRoomTurnParams) => {
  event?.preventDefault();

  const ctx = useTavernRoomContext.getState();
  const { activeCharacter, activeRoom, busy, roomCharacters, roomMessages, runtimeModel, setError } = ctx;
  const triggerType = trigger.type;
  const draftText = (
    trigger.type === "scene_drive" ? (trigger.directive ?? submittedText ?? "") : (submittedText ?? "")
  ).trim();

  // 1. 前置校验只做“能不能提交”的判断，不改动房间数据。
  if (isTavernRoomBusy(busy)) {
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

  const mode = resolveTurnMode(triggerType);
  if (!draftText && !mode.isSceneDriveMode) {
    return;
  }

  const speakerPlan = resolveSubmitSpeakerPlan({
    room: activeRoom,
    characters: roomCharacters,
    activeCharacter,
  });
  if (speakerPlan.candidateSpeakers.length === 0 && !speakerPlan.canSubmitFixedOrderUserOnlyTurn) {
    setError("当前房间还没有可回应的角色。");
    return;
  }

  const missingModelSpeaker = findMissingSpeakerModel(speakerPlan.candidateSpeakers, runtimeModel);
  if (missingModelSpeaker) {
    setError(`角色 ${missingModelSpeaker.name} 还没有可用模型。`);
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

  const currentReferencedFilePreviews = referencedFilePreviews;
  const requireSpeakerRuntimeModel = createSpeakerRuntimeModelResolver(runtimeModel);

  const activeReplyRef: ActiveReplyRef = {
    message: null,
    text: "",
  };

  try {
    beginTurnSubmission({
      ctx,
      room: activeRoom,
      mode,
    });

    // 2. 置忙之后的准备阶段也必须纳入统一收尾，避免初始化异常让界面一直停在发送中。
    let references: TavernReferencedFile[] = [];
    try {
      references = await readTurnReferences({
        ctx,
        referencedFilePreviews: currentReferencedFilePreviews,
        readReferencedFiles,
      });
    } catch (readError) {
      setError(`读取引用文件失败：${getErrorMessage(readError)}`);
      return;
    }

    const text = draftText;

    const visibleUserMessage = mode.isSceneDriveMode
      ? null
      : createUserTurnMessage({
          room: activeRoom,
          text,
          referencedFilePreviews: currentReferencedFilePreviews,
          selectedReplyOption,
        });
    const turnAnchorMessage =
      visibleUserMessage ??
      createSceneDriveTurnAnchorMessage({
        room: activeRoom,
        directive: text,
      });
    let runtime = createInitialTurnRuntime({
      room: activeRoom,
      roomMessages,
      turnAnchorMessage,
      visibleUserMessage,
    });
    const storyContext = buildTavernStoryContextPackage({
      room: runtime.runtimeRoom,
      characters: roomCharacters,
    });

    // 3. 本轮正式入队后，后续流程都围绕 runtime 这份运行时快照向前推进。
    prepareTurnUserMessage({
      ctx,
      room: activeRoom,
      turnAnchorMessage,
      visibleUserMessage,
      references,
      mode,
    });
    onCommitted?.();

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
  } catch (runError) {
    handleTurnFailure({
      ctx,
      room: activeRoom,
      error: runError,
      activeReplyRef,
    });
  } finally {
    ctx.setBusy(createIdleTavernRoomBusyState());
  }
};
