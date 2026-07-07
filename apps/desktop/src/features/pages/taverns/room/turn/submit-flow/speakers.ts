import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernRoomStoreState } from "@/features/pages/taverns/room/context";
import { createTavernMessage } from "@/features/pages/taverns/room/message";
import {
  canTavernCharacterUseNonverbalReply,
  extractTavernPendingInteractionsFromMessages,
  tavernCharacterAgentRoleId,
} from "@/features/pages/taverns/tavern/core";
import {
  buildTavernMessageSegments,
  hasTavernReplyDialogueText,
  inferTavernMessageKind,
  parseTavernReplyText,
} from "@/features/pages/taverns/room/message";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import {
  getTavernPresentationContract,
  type TavernPresentationRuntimeContract,
} from "@/features/pages/taverns/tavern/presentation/presentation-contracts";
import { runTavernInnerThought } from "@/features/pages/taverns/tavern/runtime/reply";
import { buildTavernCharacterTurnInstruction } from "@/features/pages/taverns/tavern/runtime/prompt";
import {
  buildTavernSpeakerCollaborationInput,
  runTavernCollaboration,
} from "@/features/pages/taverns/room/turn/collaboration";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter, TavernReplyOption } from "@/features/pages/taverns/manage/model";
import {
  requireTavernRuntimeModelInput,
  type ActiveReplyRef,
  type RequireSpeakerRuntimeModel,
  type TurnMode,
} from "./shared";
import { applyTavernCollaborationTraceEvent } from "./collaboration-trace";

type ParsedTavernReply = ReturnType<typeof parseTavernReplyText>;

const tavernSpeakerReplyOutputKey = (speaker: TavernCharacter) => `reply:${speaker.id}`;

const normalizeNarratorEchoText = (text: string) =>
  text.toLowerCase().replace(/[\s*_`~"'“”‘’「」『』《》【】（）()[\]{}<>.,，。!?！？;；:：、—\-]/g, "");

const isNarratorEchoReply = (replyText: string, narratorTexts: string[]) => {
  const normalizedReply = normalizeNarratorEchoText(replyText);

  return (
    normalizedReply.length > 0 &&
    narratorTexts.some((narratorText) => normalizeNarratorEchoText(narratorText) === normalizedReply)
  );
};

const buildRetryTurnInstruction = ({
  effectiveTurnInstruction,
  nonverbalReplyAllowed,
  presentationContract,
  speaker,
}: {
  effectiveTurnInstruction: string;
  nonverbalReplyAllowed: boolean;
  presentationContract: TavernPresentationRuntimeContract;
  speaker: TavernCharacter;
}) =>
  [
    effectiveTurnInstruction,
    "",
    "<retry_instruction>",
    presentationContract.buildRetryMissingLine(nonverbalReplyAllowed),
    presentationContract.buildRetryTemplateLine(speaker, nonverbalReplyAllowed),
    presentationContract.buildRetryGuidanceLine(nonverbalReplyAllowed),
    "</retry_instruction>",
  ]
    .filter(Boolean)
    .join("\n");

const isFinalReplyUsable = (reply: ParsedTavernReply, contentOnlyReplyAllowed: boolean) =>
  contentOnlyReplyAllowed
    ? Boolean(reply.content.trim())
    : Boolean(reply.content.trim() && hasTavernReplyDialogueText(reply.content));

const resolveFinalReplyText = ({
  finalReply,
  contentOnlyReplyAllowed,
  presentationContract,
  speaker,
}: {
  finalReply: ParsedTavernReply;
  contentOnlyReplyAllowed: boolean;
  presentationContract: TavernPresentationRuntimeContract;
  speaker: TavernCharacter;
}) =>
  contentOnlyReplyAllowed
    ? finalReply.content.trim()
      ? finalReply.content
      : presentationContract.buildEmptyContentFallback(speaker)
    : finalReply.content.trim() && hasTavernReplyDialogueText(finalReply.content)
      ? finalReply.content
      : "（对方短暂沉默，杯沿映着灯光。）";

const generateMissingInnerThought = async ({
  ctx,
  runtimeRoom,
  speaker,
  runtimeModel,
  turnMessages,
  text,
  finalText,
  storyContext,
}: {
  ctx: TavernRoomStoreState;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  runtimeModel: RuntimeModelOption;
  turnMessages: TavernMessage[];
  text: string;
  finalText: string;
  storyContext: TavernStoryContextPackage;
}) => {
  try {
    return await runTavernInnerThought({
      workspacePath: ctx.workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      activeCharacter: speaker,
      characters: ctx.roomCharacters,
      messages: turnMessages,
      currentUserText: text,
      replyContent: finalText,
      storyContext,
    });
  } catch {
    return undefined;
  }
};

const runSpeakerReplyThroughCollaboration = async ({
  ctx,
  runtimeRoom,
  speaker,
  speakerRuntimeModel,
  characters,
  turnMessages,
  references,
  currentUserText,
  turnInstruction,
  allowNonverbalReply,
  storyContext,
  onTextDelta,
  traceOptions,
}: {
  ctx: TavernRoomStoreState;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  speakerRuntimeModel: RuntimeModelOption;
  characters: TavernCharacter[];
  turnMessages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction: string;
  allowNonverbalReply: boolean;
  storyContext: TavernStoryContextPackage;
  onTextDelta: (delta: string) => void;
  traceOptions?: {
    scopeLabel?: string;
    agentRoleLabelById?: Record<string, string | undefined>;
  };
}) => {
  const collaborationInput = buildTavernSpeakerCollaborationInput({
    workspacePath: ctx.workspace.path,
    runtimeModel: requireTavernRuntimeModelInput(speakerRuntimeModel),
    room: runtimeRoom,
    speakers: [speaker],
    characters,
    messages: turnMessages,
    references,
    currentUserText,
    storyContext,
    turnInstructionByCharacterId: {
      [speaker.id]: turnInstruction,
    },
    allowNonverbalReplyCharacterIds: allowNonverbalReply ? [speaker.id] : [],
  });
  const output = await runTavernCollaboration({
    ...collaborationInput,
    onEvent: (event) => {
      applyTavernCollaborationTraceEvent(ctx, event, traceOptions);
    },
    onAgentEvent: (event) => {
      if (
        event.agentRoleId !== tavernCharacterAgentRoleId(runtimeRoom, speaker) ||
        event.event.type !== "text_delta" ||
        typeof event.event.delta !== "string"
      ) {
        return;
      }

      onTextDelta(event.event.delta);
    },
  });
  const outputKey = tavernSpeakerReplyOutputKey(speaker);
  const outputText = output.steps.find((step) => step.outputKey === outputKey)?.text;

  return {
    text: outputText ?? "",
    taskId: output.taskId,
  };
};

type SpeakerReplyPlan = {
  speaker: TavernCharacter;
  speakerRuntimeModel: RuntimeModelOption;
  speakerStepId: string;
  speakerIndex: number;
  speakerCount: number;
  nonverbalReplyAllowed: boolean;
  presentationContract: TavernPresentationRuntimeContract;
  contentOnlyReplyAllowed: boolean;
  effectiveTurnInstruction: string;
};

type SpeakerReplyRuntime = SpeakerReplyPlan & {
  replyMessage: TavernMessage | null;
  streamedText: string;
};

const buildSpeakerReplyPlan = ({
  room,
  runtimeRoom,
  speaker,
  speakerIndex,
  speakerCount,
  directorReason,
  directorNonverbalReplyIds,
  selectedReplyOption,
  text,
  mode,
  requireSpeakerRuntimeModel,
}: {
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  selectedReplyOption?: TavernReplyOption;
  text: string;
  mode: TurnMode;
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
}): SpeakerReplyPlan => {
  const speakerRuntimeModel = requireSpeakerRuntimeModel(speaker);
  const nonverbalReplyAllowed = canTavernCharacterUseNonverbalReply({
    room: runtimeRoom,
    characterId: speaker.id,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    directorNonverbalReplyIds,
    currentUserText: text,
    directorReason,
  });
  const presentationProfile = getTavernPresentationProfile(runtimeRoom.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const contentOnlyReplyAllowed = nonverbalReplyAllowed || presentationContract.allowsContentOnlyReply;
  const turnInstruction = buildTavernCharacterTurnInstruction({
    room,
    speaker,
    speakerIndex,
    speakerCount,
    isDirectorLikeMode: mode.isDirectorLikeMode,
    isSceneDriveMode: mode.isSceneDriveMode,
    directorReason,
    allowNonverbalReply: nonverbalReplyAllowed,
  });

  return {
    speaker,
    speakerRuntimeModel,
    speakerStepId: `speaker-${speaker.id}-${speakerIndex}`,
    speakerIndex,
    speakerCount,
    nonverbalReplyAllowed,
    presentationContract,
    contentOnlyReplyAllowed,
    effectiveTurnInstruction: turnInstruction ?? "",
  };
};

const ensureSpeakerReplyRuntimeStarted = ({
  activeReplyRef,
  ctx,
  mode,
  room,
  runtime,
  runtimeRoom,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomStoreState;
  mode: TurnMode;
  room: TavernRoom;
  runtime: SpeakerReplyRuntime;
  runtimeRoom: TavernRoom;
}) => {
  if (runtime.replyMessage) {
    activeReplyRef.message = runtime.replyMessage;
    return runtime.replyMessage;
  }

  const { speaker } = runtime;
  ctx.setBusyStatus(mode.isDirectorLikeMode ? `${speaker.name} 正在按导演调度回应...` : `${speaker.name} 正在回应...`);
  ctx.appendExecutionStep?.({
    id: runtime.speakerStepId,
    label: `${speaker.name} 回复`,
    detail: `${runtime.speakerIndex + 1}/${runtime.speakerCount}`,
    status: "running",
  });

  const replyMessage = createTavernMessage({
    roomId: room.id,
    role: "character",
    characterId: speaker.id,
    presentationProfileId: runtimeRoom.presentation?.profileId,
    content: "",
    status: "streaming",
  });
  runtime.replyMessage = replyMessage;
  runtime.streamedText = "";
  activeReplyRef.message = replyMessage;
  activeReplyRef.text = "";
  ctx.appendMessagesToRoom(room.id, [replyMessage]);

  return replyMessage;
};

const appendSpeakerReplyDelta = ({
  activeReplyRef,
  ctx,
  delta,
  runtime,
  runtimeRoom,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomStoreState;
  delta: string;
  runtime: SpeakerReplyRuntime;
  runtimeRoom: TavernRoom;
}) => {
  if (!runtime.replyMessage) {
    return;
  }

  runtime.streamedText += delta;
  const streamedReply = parseTavernReplyText({
    text: runtime.streamedText,
    activeCharacter: runtime.speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });
  activeReplyRef.message = runtime.replyMessage;
  activeReplyRef.text = streamedReply.content;
  ctx.patchMessage(runtime.replyMessage.id, {
    content: streamedReply.content,
    thought: streamedReply.thought,
    status: "streaming",
  });
};

const resetSpeakerReplyRuntimeForRetry = ({
  activeReplyRef,
  ctx,
  runtime,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomStoreState;
  runtime: SpeakerReplyRuntime;
}) => {
  runtime.streamedText = "";
  activeReplyRef.text = "";
  activeReplyRef.message = runtime.replyMessage;
  if (!runtime.replyMessage) {
    return;
  }
  ctx.patchMessage(runtime.replyMessage.id, {
    content: "",
    thought: undefined,
    status: "streaming",
  });
};

const finalizeSpeakerReplyRuntime = async ({
  activeReplyRef,
  ctx,
  currentUserText,
  references,
  runtime,
  runtimeRoom,
  storyContext,
  text,
  turnMessages,
  turnNarratorTexts,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomStoreState;
  currentUserText: string;
  references: TavernReferencedFile[];
  runtime: SpeakerReplyRuntime;
  runtimeRoom: TavernRoom;
  storyContext: TavernStoryContextPackage;
  text: string;
  turnMessages: TavernMessage[];
  turnNarratorTexts: string[];
}) => {
  const replyMessage = runtime.replyMessage;
  if (!replyMessage) {
    return null;
  }

  let finalReply = parseTavernReplyText({
    text: text || runtime.streamedText,
    activeCharacter: runtime.speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });

  if (!isFinalReplyUsable(finalReply, runtime.contentOnlyReplyAllowed)) {
    ctx.patchExecutionStep?.(runtime.speakerStepId, {
      status: "running",
      detail: "公开回复不完整，正在重试...",
    });
    resetSpeakerReplyRuntimeForRetry({
      activeReplyRef,
      ctx,
      runtime,
    });
    const retryResult = await runSpeakerReplyThroughCollaboration({
      ctx,
      runtimeRoom,
      speaker: runtime.speaker,
      speakerRuntimeModel: runtime.speakerRuntimeModel,
      characters: ctx.roomCharacters,
      turnMessages,
      references,
      currentUserText,
      turnInstruction: buildRetryTurnInstruction({
        effectiveTurnInstruction: runtime.effectiveTurnInstruction,
        nonverbalReplyAllowed: runtime.nonverbalReplyAllowed,
        presentationContract: runtime.presentationContract,
        speaker: runtime.speaker,
      }),
      allowNonverbalReply: runtime.nonverbalReplyAllowed,
      storyContext,
      onTextDelta: (delta) =>
        appendSpeakerReplyDelta({
          activeReplyRef,
          ctx,
          delta,
          runtime,
          runtimeRoom,
        }),
      traceOptions: {
        scopeLabel: `${runtime.speaker.name} 回复`,
        agentRoleLabelById: {
          [tavernCharacterAgentRoleId(runtimeRoom, runtime.speaker)]: runtime.speaker.name,
        },
      },
    });
    finalReply = parseTavernReplyText({
      text: retryResult.text || runtime.streamedText,
      activeCharacter: runtime.speaker,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
    });
  }

  const finalText = resolveFinalReplyText({
    finalReply,
    contentOnlyReplyAllowed: runtime.contentOnlyReplyAllowed,
    presentationContract: runtime.presentationContract,
    speaker: runtime.speaker,
  });
  if (isNarratorEchoReply(finalText, turnNarratorTexts)) {
    ctx.removeMessage(replyMessage.id);
    ctx.patchExecutionStep?.(runtime.speakerStepId, {
      status: "done",
      detail: "已跳过重复旁白。",
    });
    activeReplyRef.message = null;
    activeReplyRef.text = "";
    return null;
  }

  const finalThought =
    finalReply.thought ||
    (await generateMissingInnerThought({
      ctx,
      runtimeRoom,
      speaker: runtime.speaker,
      runtimeModel: runtime.speakerRuntimeModel,
      turnMessages,
      text: currentUserText,
      finalText,
      storyContext,
    }));
  const finalizedMessage: TavernMessage = {
    ...replyMessage,
    content: finalText,
    thought: finalThought,
    kind: inferTavernMessageKind({
      role: replyMessage.role,
      presentationProfileId: replyMessage.presentationProfileId,
    }),
    segments: buildTavernMessageSegments({
      ...replyMessage,
      content: finalText,
      thought: finalThought,
    }),
    status: "done",
  };
  ctx.patchMessage(replyMessage.id, {
    content: finalText,
    thought: finalThought,
    segments: finalizedMessage.segments,
    status: "done",
  });
  ctx.patchExecutionStep?.(runtime.speakerStepId, {
    status: "done",
    detail: finalText.slice(0, 120),
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return finalizedMessage;
};

const runSpeakerReplyRoundThroughCollaboration = async ({
  activeReplyRef,
  ctx,
  currentUserText,
  directorNonverbalReplyIds,
  directorReason,
  mode,
  references,
  requireSpeakerRuntimeModel,
  room,
  runtimeMessages,
  runtimeRoom,
  selectedReplyOption,
  speakers,
  storyContext,
  turnMessages,
  turnNarratorTexts,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomStoreState;
  currentUserText: string;
  directorNonverbalReplyIds: string[];
  directorReason: string;
  mode: TurnMode;
  references: TavernReferencedFile[];
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
  room: TavernRoom;
  runtimeMessages: TavernMessage[];
  runtimeRoom: TavernRoom;
  selectedReplyOption?: TavernReplyOption;
  speakers: TavernCharacter[];
  storyContext: TavernStoryContextPackage;
  turnMessages: TavernMessage[];
  turnNarratorTexts: string[];
}) => {
  const runtimes = speakers.map((speaker, index): SpeakerReplyRuntime => ({
    ...buildSpeakerReplyPlan({
      room,
      runtimeRoom,
      speaker,
      speakerIndex: index,
      speakerCount: speakers.length,
      directorReason,
      directorNonverbalReplyIds,
      selectedReplyOption,
      text: currentUserText,
      mode,
      requireSpeakerRuntimeModel,
    }),
    replyMessage: null,
    streamedText: "",
  }));
  const runtimeByAgentRoleId = new Map(
    runtimes.map((runtime) => [tavernCharacterAgentRoleId(runtimeRoom, runtime.speaker), runtime]),
  );
  const runtimeByOutputKey = new Map(
    runtimes.map((runtime) => [tavernSpeakerReplyOutputKey(runtime.speaker), runtime]),
  );
  const agentRoleLabelById = Object.fromEntries(
    runtimes.map((runtime) => [tavernCharacterAgentRoleId(runtimeRoom, runtime.speaker), runtime.speaker.name]),
  );
  const firstRuntime = runtimes[0];
  if (!firstRuntime) {
    return {
      runtimeMessages,
      turnMessages,
    };
  }

  const collaborationInput = buildTavernSpeakerCollaborationInput({
    workspacePath: ctx.workspace.path,
    runtimeModel: requireTavernRuntimeModelInput(firstRuntime.speakerRuntimeModel),
    room: runtimeRoom,
    speakers,
    characters: ctx.roomCharacters,
    messages: turnMessages,
    references,
    currentUserText,
    storyContext,
    turnInstructionByCharacterId: Object.fromEntries(
      runtimes.map((runtime) => [runtime.speaker.id, runtime.effectiveTurnInstruction]),
    ),
    allowNonverbalReplyCharacterIds: runtimes
      .filter((runtime) => runtime.nonverbalReplyAllowed)
      .map((runtime) => runtime.speaker.id),
  });
  const output = await runTavernCollaboration({
    ...collaborationInput,
    onEvent: (event) => {
      applyTavernCollaborationTraceEvent(ctx, event, {
        scopeLabel: "角色协作",
        agentRoleLabelById,
      });
      if (event.type !== "step_started" || !event.agentRoleId) {
        return;
      }

      const runtime = runtimeByAgentRoleId.get(event.agentRoleId);
      if (!runtime) {
        return;
      }
      ensureSpeakerReplyRuntimeStarted({
        activeReplyRef,
        ctx,
        mode,
        room,
        runtime,
        runtimeRoom,
      });
    },
    onAgentEvent: (event) => {
      if (event.event.type !== "text_delta" || typeof event.event.delta !== "string") {
        return;
      }

      const runtime = runtimeByAgentRoleId.get(event.agentRoleId);
      if (!runtime) {
        return;
      }
      ensureSpeakerReplyRuntimeStarted({
        activeReplyRef,
        ctx,
        mode,
        room,
        runtime,
        runtimeRoom,
      });
      appendSpeakerReplyDelta({
        activeReplyRef,
        ctx,
        delta: event.event.delta,
        runtime,
        runtimeRoom,
      });
    },
  }).catch((error: unknown) => {
    for (const runtime of runtimes) {
      if (!runtime.replyMessage || activeReplyRef.message?.id === runtime.replyMessage.id) {
        continue;
      }
      ctx.patchMessage(runtime.replyMessage.id, {
        status: "error",
      });
      ctx.patchExecutionStep?.(runtime.speakerStepId, {
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  });
  const outputTextByKey = new Map(output.steps.map((step) => [step.outputKey, step.text]));

  for (const [outputKey, runtime] of runtimeByOutputKey) {
    const outputText = outputTextByKey.get(outputKey);
    if (outputText === undefined && !runtime.replyMessage) {
      continue;
    }
    ensureSpeakerReplyRuntimeStarted({
      activeReplyRef,
      ctx,
      mode,
      room,
      runtime,
      runtimeRoom,
    });
    const finalizedMessage = await finalizeSpeakerReplyRuntime({
      activeReplyRef,
      ctx,
      currentUserText,
      references,
      runtime,
      runtimeRoom,
      storyContext,
      text: outputText ?? runtime.streamedText,
      turnMessages,
      turnNarratorTexts,
    });
    if (finalizedMessage) {
      runtimeMessages = [...runtimeMessages, finalizedMessage];
      turnMessages.push(finalizedMessage);
    }
  }

  return {
    runtimeMessages,
    turnMessages,
  };
};

const runSingleSpeakerReply = async ({
  ctx,
  room,
  runtimeRoom,
  speaker,
  speakerIndex,
  speakerCount,
  directorReason,
  directorNonverbalReplyIds,
  selectedReplyOption,
  text,
  references,
  turnMessages,
  turnNarratorTexts,
  mode,
  requireSpeakerRuntimeModel,
  activeReplyRef,
  storyContext,
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  selectedReplyOption?: TavernReplyOption;
  text: string;
  references: TavernReferencedFile[];
  turnMessages: TavernMessage[];
  turnNarratorTexts: string[];
  mode: TurnMode;
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
  activeReplyRef: ActiveReplyRef;
  storyContext: TavernStoryContextPackage;
}) => {
  const speakerRuntimeModel = requireSpeakerRuntimeModel(speaker);
  const nonverbalReplyAllowed = canTavernCharacterUseNonverbalReply({
    room: runtimeRoom,
    characterId: speaker.id,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    directorNonverbalReplyIds,
    currentUserText: text,
    directorReason,
  });
  const presentationProfile = getTavernPresentationProfile(runtimeRoom.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const contentOnlyReplyAllowed = nonverbalReplyAllowed || presentationContract.allowsContentOnlyReply;
  const speakerStepId = `speaker-${speaker.id}-${speakerIndex}`;
  ctx.setBusyStatus(mode.isDirectorLikeMode ? `${speaker.name} 正在按导演调度回应...` : `${speaker.name} 正在回应...`);
  ctx.appendExecutionStep?.({
    id: speakerStepId,
    label: `${speaker.name} 回复`,
    detail: `${speakerIndex + 1}/${speakerCount}`,
    status: "running",
  });

  const replyMessage = createTavernMessage({
    roomId: room.id,
    role: "character",
    characterId: speaker.id,
    presentationProfileId: runtimeRoom.presentation?.profileId,
    content: "",
    status: "streaming",
  });
  activeReplyRef.message = replyMessage;
  activeReplyRef.text = "";
  ctx.appendMessagesToRoom(room.id, [replyMessage]);

  const turnInstruction = buildTavernCharacterTurnInstruction({
    room,
    speaker,
    speakerIndex,
    speakerCount,
    isDirectorLikeMode: mode.isDirectorLikeMode,
    isSceneDriveMode: mode.isSceneDriveMode,
    directorReason,
    allowNonverbalReply: nonverbalReplyAllowed,
  });
  const effectiveTurnInstruction = turnInstruction ?? "";

  let streamedText = "";
  const handleReplyTextDelta = (delta: string) => {
    streamedText += delta;
    const streamedReply = parseTavernReplyText({
      text: streamedText,
      activeCharacter: speaker,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
    });
    activeReplyRef.text = streamedReply.content;
    ctx.patchMessage(replyMessage.id, {
      content: streamedReply.content,
      thought: streamedReply.thought,
      status: "streaming",
    });
  };

  let result = await runSpeakerReplyThroughCollaboration({
    ctx,
    runtimeRoom,
    speaker,
    speakerRuntimeModel,
    characters: ctx.roomCharacters,
    turnMessages,
    references,
    currentUserText: text,
    turnInstruction: effectiveTurnInstruction,
    allowNonverbalReply: nonverbalReplyAllowed,
    storyContext,
    onTextDelta: handleReplyTextDelta,
    traceOptions: {
      scopeLabel: `${speaker.name} 回复`,
      agentRoleLabelById: {
        [tavernCharacterAgentRoleId(runtimeRoom, speaker)]: speaker.name,
      },
    },
  });
  let finalReply = parseTavernReplyText({
    text: result.text || streamedText,
    activeCharacter: speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });

  if (!isFinalReplyUsable(finalReply, contentOnlyReplyAllowed)) {
    ctx.patchExecutionStep?.(speakerStepId, {
      status: "running",
      detail: "公开回复不完整，正在重试...",
    });
    streamedText = "";
    activeReplyRef.text = "";
    ctx.patchMessage(replyMessage.id, {
      content: "",
      thought: undefined,
      status: "streaming",
    });
    result = await runSpeakerReplyThroughCollaboration({
      ctx,
      runtimeRoom,
      speaker,
      speakerRuntimeModel,
      characters: ctx.roomCharacters,
      turnMessages,
      references,
      currentUserText: text,
      turnInstruction: buildRetryTurnInstruction({
        effectiveTurnInstruction,
        nonverbalReplyAllowed,
        presentationContract,
        speaker,
      }),
      allowNonverbalReply: nonverbalReplyAllowed,
      storyContext,
      onTextDelta: handleReplyTextDelta,
      traceOptions: {
        scopeLabel: `${speaker.name} 回复`,
        agentRoleLabelById: {
          [tavernCharacterAgentRoleId(runtimeRoom, speaker)]: speaker.name,
        },
      },
    });
    finalReply = parseTavernReplyText({
      text: result.text || streamedText,
      activeCharacter: speaker,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
    });
  }

  const finalText = resolveFinalReplyText({
    finalReply,
    contentOnlyReplyAllowed,
    presentationContract,
    speaker,
  });
  if (isNarratorEchoReply(finalText, turnNarratorTexts)) {
    ctx.removeMessage(replyMessage.id);
    ctx.patchExecutionStep?.(speakerStepId, {
      status: "done",
      detail: "已跳过重复旁白。",
    });
    activeReplyRef.message = null;
    activeReplyRef.text = "";
    return null;
  }

  const finalThought =
    finalReply.thought ||
    (await generateMissingInnerThought({
      ctx,
      runtimeRoom,
      speaker,
      runtimeModel: speakerRuntimeModel,
      turnMessages,
      text,
      finalText,
      storyContext,
    }));
  const finalizedMessage: TavernMessage = {
    ...replyMessage,
    content: finalText,
    thought: finalThought,
    kind: inferTavernMessageKind({
      role: replyMessage.role,
      presentationProfileId: replyMessage.presentationProfileId,
    }),
    segments: buildTavernMessageSegments({
      ...replyMessage,
      content: finalText,
      thought: finalThought,
    }),
    status: "done",
  };
  ctx.patchMessage(replyMessage.id, {
    content: finalText,
    thought: finalThought,
    segments: finalizedMessage.segments,
    status: "done",
  });
  ctx.patchExecutionStep?.(speakerStepId, {
    status: "done",
    detail: finalText.slice(0, 120),
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return finalizedMessage;
};

const shouldRunSpeakerRoundThroughCollaboration = ({ speakers }: { speakers: TavernCharacter[] }) =>
  speakers.length > 1;

export const runSpeakerReplyFlow = async ({
  ctx,
  room,
  runtimeRoom,
  runtimeMessages,
  turnMessages,
  userMessage,
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
}: {
  ctx: TavernRoomStoreState;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  userMessage: TavernMessage;
  text: string;
  references: TavernReferencedFile[];
  selectedReplyOption?: TavernReplyOption;
  speakers: TavernCharacter[];
  mode: TurnMode;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  turnNarratorTexts: string[];
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
  activeReplyRef: ActiveReplyRef;
  storyContext: TavernStoryContextPackage;
}) => {
  if (shouldRunSpeakerRoundThroughCollaboration({ speakers })) {
    const speakerRound = await runSpeakerReplyRoundThroughCollaboration({
      ctx,
      room,
      runtimeRoom,
      currentUserText: text,
      directorReason,
      directorNonverbalReplyIds,
      selectedReplyOption,
      references,
      runtimeMessages,
      turnMessages,
      turnNarratorTexts,
      mode,
      requireSpeakerRuntimeModel,
      activeReplyRef,
      speakers,
      storyContext,
    });
    runtimeMessages = speakerRound.runtimeMessages;
    turnMessages = speakerRound.turnMessages;
  } else {
    for (const [speakerIndex, speaker] of speakers.entries()) {
      const finalizedMessage = await runSingleSpeakerReply({
        ctx,
        room,
        runtimeRoom,
        speaker,
        speakerIndex,
        speakerCount: speakers.length,
        directorReason,
        directorNonverbalReplyIds,
        selectedReplyOption,
        text,
        references,
        turnMessages,
        turnNarratorTexts,
        mode,
        requireSpeakerRuntimeModel,
        activeReplyRef,
        storyContext,
      });

      if (finalizedMessage) {
        runtimeMessages = [...runtimeMessages, finalizedMessage];
        turnMessages.push(finalizedMessage);
      }
    }
  }

  return {
    runtimeMessages,
    turnMessages,
    openPendingInteractions: extractTavernPendingInteractionsFromMessages({
      messages: turnMessages,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
      turnId: userMessage.turnId ?? userMessage.id,
    }),
  };
};
