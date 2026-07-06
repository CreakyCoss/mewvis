import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernPageContextValue } from "@/features/pages/taverns/components/context";
import { createTavernMessage } from "../../../../message";
import {
  canTavernCharacterUseNonverbalReply,
  extractTavernPendingInteractionsFromMessages,
  planTavernContinuation,
  shouldSuppressTavernAutoContinuation,
  tavernCharacterAgentRoleId,
} from "../../../../core";
import {
  buildTavernMessageSegments,
  hasTavernReplyDialogueText,
  inferTavernMessageKind,
  parseTavernReplyText,
} from "../../../../message";
import { compactTavernAgentKnowledge } from "../../../../runtime/conversation";
import { getTavernPresentationProfile } from "../../../../prompt-registry/presentation-rules";
import {
  getTavernPresentationContract,
  type TavernPresentationRuntimeContract,
} from "../../../../presentation/presentation-contracts";
import { runTavernInnerThought } from "../../../../runtime/reply";
import { buildTavernCharacterTurnInstruction } from "../../../../runtime/prompt";
import {
  buildTavernSpeakerCollaborationInput,
  runTavernCollaboration,
} from "../../../../runtime/collaboration";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
} from "../../../../types";
import {
  getErrorMessage,
  requireTavernRuntimeModelInput,
  shouldCompactCharacterKnowledgeAfterTurn,
  type ActiveReplyRef,
  type RequireSpeakerRuntimeModel,
  type TavernPendingInteractions,
  type TurnMode,
} from "./shared";
import {
  applyTavernCollaborationTraceEvent,
} from "./collaboration-trace";

type ParsedTavernReply = ReturnType<typeof parseTavernReplyText>;

const tavernSpeakerReplyOutputKey = (speaker: TavernCharacter) => `reply:${speaker.id}`;

const normalizeNarratorEchoText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s*_`~"'“”‘’「」『』《》【】（）()[\]{}<>.,，。!?！？;；:：、—\-]/g, "");

const isNarratorEchoReply = (replyText: string, narratorTexts: string[]) => {
  const normalizedReply = normalizeNarratorEchoText(replyText);

  return normalizedReply.length > 0 && narratorTexts.some((narratorText) =>
    normalizeNarratorEchoText(narratorText) === normalizedReply
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
}) => [
  effectiveTurnInstruction,
  "",
  "<retry_instruction>",
  presentationContract.buildRetryMissingLine(nonverbalReplyAllowed),
  presentationContract.buildRetryTemplateLine(speaker, nonverbalReplyAllowed),
  presentationContract.buildRetryGuidanceLine(nonverbalReplyAllowed),
  "</retry_instruction>",
].filter(Boolean).join("\n");

const isFinalReplyUsable = (
  reply: ParsedTavernReply,
  contentOnlyReplyAllowed: boolean,
) => contentOnlyReplyAllowed
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
}) => contentOnlyReplyAllowed
  ? (finalReply.content.trim()
      ? finalReply.content
      : presentationContract.buildEmptyContentFallback(speaker))
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
  ctx: TavernPageContextValue;
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

const compactSpeakerKnowledgeIfNeeded = async ({
  ctx,
  room,
  speaker,
  runtimeModel,
  runtimeMessages,
  currentSpeakerRunIndex,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  speaker: TavernCharacter;
  runtimeModel: RuntimeModelOption;
  runtimeMessages: TavernMessage[];
  currentSpeakerRunIndex: number;
}) => {
  if (!shouldCompactCharacterKnowledgeAfterTurn(room, runtimeMessages, speaker.id)) {
    return;
  }

  const compactStepId = `compact-${speaker.id}-${currentSpeakerRunIndex}`;
  ctx.setTurnStatus(`${speaker.name} 正在压缩角色知识...`);
  ctx.appendExecutionStep({
    id: compactStepId,
    label: `${speaker.name} 知识压缩`,
    detail: "达到固定轮次，调用底层压缩。",
    status: "running",
  });

  try {
    const compactResult = await compactTavernAgentKnowledge({
      workspacePath: ctx.workspace.path,
      room,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      agentRoleId: tavernCharacterAgentRoleId(room, speaker),
      compactInstruction: [
        `压缩「${speaker.name}」在当前酒馆中的长期角色知识。`,
        "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
        "不要引入其他角色未公开的心理描写。",
      ].join("\n"),
    });
    ctx.patchExecutionStep(compactStepId, {
      status: "done",
      detail: compactResult?.compacted === false
        ? "底层 session 暂无可压缩内容。"
        : "底层压缩已完成。",
    });
  } catch (compactError) {
    ctx.patchExecutionStep(compactStepId, {
      status: "error",
      detail: getErrorMessage(compactError),
    });
    ctx.setError(`压缩 ${speaker.name} 的角色知识失败：${getErrorMessage(compactError)}`);
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
}: {
  ctx: TavernPageContextValue;
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
      applyTavernCollaborationTraceEvent(ctx, event, {
        scopeLabel: `${speaker.name} 回复`,
        agentRoleLabelById: {
          [tavernCharacterAgentRoleId(runtimeRoom, speaker)]: speaker.name,
        },
      });
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
  currentSpeakerRunIndex: number;
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
  currentSpeakerRunIndex,
  continuationInstruction,
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
  currentSpeakerRunIndex: number;
  continuationInstruction?: string;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  selectedReplyOption?: TavernReplyOption;
  text: string;
  mode: TurnMode;
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
}): SpeakerReplyPlan => {
  const speakerRuntimeModel = requireSpeakerRuntimeModel(speaker);
  const directorReasonForCharacter = runtimeRoom.settings.informationPolicy.hiddenFacts.enabled ||
      runtimeRoom.settings.informationPolicy.mode === "social_deduction" ||
      runtimeRoom.settings.informationPolicy.mode === "mystery"
    ? "导演根据当前公开流程安排本轮发言；只依据自己可见信息回应，不要泄露身份、阵营或私密事实。"
    : directorReason;
  const nonverbalReplyAllowed = canTavernCharacterUseNonverbalReply({
    room: runtimeRoom,
    characterId: speaker.id,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    directorNonverbalReplyIds,
    currentUserText: text,
    directorReason: [
      directorReasonForCharacter,
      continuationInstruction,
    ].filter(Boolean).join("\n"),
  });
  const presentationProfile = getTavernPresentationProfile(runtimeRoom.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const contentOnlyReplyAllowed =
    nonverbalReplyAllowed || presentationContract.allowsContentOnlyReply;
  const turnInstruction = buildTavernCharacterTurnInstruction({
    room,
    speaker,
    speakerIndex,
    speakerCount,
    isDirectorLikeMode: mode.isDirectorLikeMode,
    isManagedMode: mode.isManagedMode,
    isSceneDriveMode: mode.isSceneDriveMode,
    directorReason: directorReasonForCharacter,
    allowNonverbalReply: nonverbalReplyAllowed,
  });
  const effectiveTurnInstruction = continuationInstruction
    ? [
        turnInstruction ?? "",
        "",
        "<continuation_instruction>",
        continuationInstruction,
        "这是一次自动续调度，只回应对应待回应事项；不要替其他角色或用户发言，回答后把控制权留给现场。",
        "</continuation_instruction>",
      ].join("\n")
    : turnInstruction ?? "";

  return {
    speaker,
    speakerRuntimeModel,
    speakerStepId: `speaker-${speaker.id}-${currentSpeakerRunIndex}`,
    currentSpeakerRunIndex,
    speakerIndex,
    speakerCount,
    nonverbalReplyAllowed,
    presentationContract,
    contentOnlyReplyAllowed,
    effectiveTurnInstruction,
  };
};

const ensureSpeakerReplyRuntimeStarted = ({
  activeContinuationInteractionIds,
  activeReplyRef,
  ctx,
  mode,
  room,
  runtime,
  runtimeRoom,
}: {
  activeContinuationInteractionIds: string[];
  activeReplyRef: ActiveReplyRef;
  ctx: TavernPageContextValue;
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
  ctx.setTurnStatus(mode.isDirectorLikeMode
    ? `${speaker.name} 正在按导演调度回应...`
    : `${speaker.name} 正在回应...`);
  ctx.appendExecutionStep({
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
    respondsToInteractionIds: activeContinuationInteractionIds.length > 0
      ? activeContinuationInteractionIds
      : undefined,
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
  ctx: TavernPageContextValue;
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
  ctx: TavernPageContextValue;
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
  room,
  runtime,
  runtimeMessages,
  runtimeRoom,
  storyContext,
  text,
  turnMessages,
  turnNarratorTexts,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernPageContextValue;
  currentUserText: string;
  references: TavernReferencedFile[];
  room: TavernRoom;
  runtime: SpeakerReplyRuntime;
  runtimeMessages: TavernMessage[];
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
    ctx.patchExecutionStep(runtime.speakerStepId, {
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
      onTextDelta: (delta) => appendSpeakerReplyDelta({
        activeReplyRef,
        ctx,
        delta,
        runtime,
        runtimeRoom,
      }),
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
    ctx.patchExecutionStep(runtime.speakerStepId, {
      status: "done",
      detail: "已跳过重复旁白。",
    });
    activeReplyRef.message = null;
    activeReplyRef.text = "";
    return null;
  }

  const finalThought = finalReply.thought || await generateMissingInnerThought({
    ctx,
    runtimeRoom,
    speaker: runtime.speaker,
    runtimeModel: runtime.speakerRuntimeModel,
    turnMessages,
    text: currentUserText,
    finalText,
    storyContext,
  });
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
  ctx.patchExecutionStep(runtime.speakerStepId, {
    status: "done",
    detail: finalText.slice(0, 120),
  });

  await compactSpeakerKnowledgeIfNeeded({
    ctx,
    room,
    speaker: runtime.speaker,
    runtimeModel: runtime.speakerRuntimeModel,
    runtimeMessages: [...runtimeMessages, finalizedMessage],
    currentSpeakerRunIndex: runtime.currentSpeakerRunIndex,
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return finalizedMessage;
};

const runSpeakerReplyRoundThroughCollaboration = async ({
  activeContinuationInteractionIds,
  activeReplyRef,
  ctx,
  currentSpeakerRunIndexStart,
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
  activeContinuationInteractionIds: string[];
  activeReplyRef: ActiveReplyRef;
  ctx: TavernPageContextValue;
  currentSpeakerRunIndexStart: number;
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
      currentSpeakerRunIndex: currentSpeakerRunIndexStart + index,
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
  const runtimeByAgentRoleId = new Map(runtimes.map((runtime) => [
    tavernCharacterAgentRoleId(runtimeRoom, runtime.speaker),
    runtime,
  ]));
  const agentRoleLabelById = Object.fromEntries(
    runtimes.map((runtime) => [
      tavernCharacterAgentRoleId(runtimeRoom, runtime.speaker),
      runtime.speaker.name,
    ]),
  );
  const runtimeByOutputKey = new Map(runtimes.map((runtime) => [
    tavernSpeakerReplyOutputKey(runtime.speaker),
    runtime,
  ]));
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
      runtimes.map((runtime) => [
        runtime.speaker.id,
        runtime.effectiveTurnInstruction,
      ]),
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
        activeContinuationInteractionIds,
        activeReplyRef,
        ctx,
        mode,
        room,
        runtime,
        runtimeRoom,
      });
    },
    onAgentEvent: (event) => {
      if (
        event.event.type !== "text_delta" ||
        typeof event.event.delta !== "string"
      ) {
        return;
      }

      const runtime = runtimeByAgentRoleId.get(event.agentRoleId);
      if (!runtime) {
        return;
      }
      ensureSpeakerReplyRuntimeStarted({
        activeContinuationInteractionIds,
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
    const message = getErrorMessage(error);
    for (const runtime of runtimes) {
      if (!runtime.replyMessage || activeReplyRef.message?.id === runtime.replyMessage.id) {
        continue;
      }
      ctx.patchMessage(runtime.replyMessage.id, {
        status: "error",
      });
      ctx.patchExecutionStep(runtime.speakerStepId, {
        status: "error",
        detail: message,
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
      activeContinuationInteractionIds,
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
      room,
      runtime,
      runtimeMessages,
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
  currentSpeakerRunIndex,
  activeContinuationInteractionIds,
  continuationInstruction,
  directorReason,
  directorNonverbalReplyIds,
  selectedReplyOption,
  text,
  references,
  turnMessages,
  runtimeMessages,
  turnNarratorTexts,
  mode,
  requireSpeakerRuntimeModel,
  activeReplyRef,
  storyContext,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  currentSpeakerRunIndex: number;
  activeContinuationInteractionIds: string[];
  continuationInstruction?: string;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  selectedReplyOption?: TavernReplyOption;
  text: string;
  references: TavernReferencedFile[];
  turnMessages: TavernMessage[];
  runtimeMessages: TavernMessage[];
  turnNarratorTexts: string[];
  mode: TurnMode;
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
  activeReplyRef: ActiveReplyRef;
  storyContext: TavernStoryContextPackage;
}) => {
  // 角色阶段只关心单个角色的流式回复、兜底重试、心理补全和知识压缩。
  const speakerRuntimeModel = requireSpeakerRuntimeModel(speaker);
  const speakerStepId = `speaker-${speaker.id}-${currentSpeakerRunIndex}`;
  const directorReasonForCharacter = runtimeRoom.settings.informationPolicy.hiddenFacts.enabled ||
      runtimeRoom.settings.informationPolicy.mode === "social_deduction" ||
      runtimeRoom.settings.informationPolicy.mode === "mystery"
    ? "导演根据当前公开流程安排本轮发言；只依据自己可见信息回应，不要泄露身份、阵营或私密事实。"
    : directorReason;
  const nonverbalReplyAllowed = canTavernCharacterUseNonverbalReply({
    room: runtimeRoom,
    characterId: speaker.id,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    directorNonverbalReplyIds,
    currentUserText: text,
    directorReason: [
      directorReasonForCharacter,
      continuationInstruction,
    ].filter(Boolean).join("\n"),
  });
  const presentationProfile = getTavernPresentationProfile(runtimeRoom.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const contentOnlyReplyAllowed =
    nonverbalReplyAllowed || presentationContract.allowsContentOnlyReply;
  ctx.setTurnStatus(mode.isDirectorLikeMode
    ? `${speaker.name} 正在按导演调度回应...`
    : `${speaker.name} 正在回应...`);
  ctx.appendExecutionStep({
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
    respondsToInteractionIds: activeContinuationInteractionIds.length > 0
      ? activeContinuationInteractionIds
      : undefined,
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
    isManagedMode: mode.isManagedMode,
    isSceneDriveMode: mode.isSceneDriveMode,
    directorReason: directorReasonForCharacter,
    allowNonverbalReply: nonverbalReplyAllowed,
  });
  const effectiveTurnInstruction = continuationInstruction
    ? [
        turnInstruction ?? "",
        "",
        "<continuation_instruction>",
        continuationInstruction,
        "这是一次自动续调度，只回应对应待回应事项；不要替其他角色或用户发言，回答后把控制权留给现场。",
        "</continuation_instruction>",
      ].join("\n")
    : turnInstruction ?? "";

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
  });
  let finalReply = parseTavernReplyText({
    text: result.text || streamedText,
    activeCharacter: speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });

  if (!isFinalReplyUsable(finalReply, contentOnlyReplyAllowed)) {
    ctx.patchExecutionStep(speakerStepId, {
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
    ctx.patchExecutionStep(speakerStepId, {
      status: "done",
      detail: "已跳过重复旁白。",
    });
    activeReplyRef.message = null;
    activeReplyRef.text = "";
    return null;
  }

  const finalThought = finalReply.thought || await generateMissingInnerThought({
    ctx,
    runtimeRoom,
    speaker,
    runtimeModel: speakerRuntimeModel,
    turnMessages,
    text,
    finalText,
    storyContext,
  });
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
  ctx.patchExecutionStep(speakerStepId, {
    status: "done",
    detail: finalText.slice(0, 120),
  });

  await compactSpeakerKnowledgeIfNeeded({
    ctx,
    room,
    speaker,
    runtimeModel: speakerRuntimeModel,
    runtimeMessages: [...runtimeMessages, finalizedMessage],
    currentSpeakerRunIndex,
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return finalizedMessage;
};

const shouldRunSpeakerRoundThroughCollaboration = ({
  continuationRound,
  speakers,
}: {
  continuationRound: number;
  speakers: TavernCharacter[];
}) => continuationRound === 0 && speakers.length > 1;

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
  availableRoomCharacters,
  mode,
  directorReason,
  directorNonverbalReplyIds,
  turnNarratorTexts,
  requireSpeakerRuntimeModel,
  activeReplyRef,
  storyContext,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  userMessage: TavernMessage;
  text: string;
  references: TavernReferencedFile[];
  selectedReplyOption?: TavernReplyOption;
  speakers: TavernCharacter[];
  availableRoomCharacters: TavernCharacter[];
  mode: TurnMode;
  directorReason: string;
  directorNonverbalReplyIds: string[];
  turnNarratorTexts: string[];
  requireSpeakerRuntimeModel: RequireSpeakerRuntimeModel;
  activeReplyRef: ActiveReplyRef;
  storyContext: TavernStoryContextPackage;
}) => {
  // 自动续调度围绕“待回应事项”循环推进；每轮仍复用单角色回复流程。
  let speakerQueue = speakers;
  let continuationRound = 0;
  let speakerRunIndex = 0;
  let latestPendingInteractions: TavernPendingInteractions = room.pendingInteractions ?? [];
  let currentContinuationInteractionIds: string[] = [];
  const closedInteractionIds = new Set<string>();
  const continuationInstructionBySpeakerId = new Map<string, string>();

  while (speakerQueue.length > 0) {
    const currentSpeakers = speakerQueue;
    speakerQueue = [];
    const activeContinuationInteractionIds = currentContinuationInteractionIds;
    currentContinuationInteractionIds = [];

    if (shouldRunSpeakerRoundThroughCollaboration({
      continuationRound,
      speakers: currentSpeakers,
    })) {
      const speakerRound = await runSpeakerReplyRoundThroughCollaboration({
        ctx,
        room,
        runtimeRoom,
        activeContinuationInteractionIds,
        currentSpeakerRunIndexStart: speakerRunIndex,
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
        speakers: currentSpeakers,
        storyContext,
      });
      speakerRunIndex += currentSpeakers.length;
      runtimeMessages = speakerRound.runtimeMessages;
      turnMessages = speakerRound.turnMessages;
    } else {
      for (const [speakerIndex, speaker] of currentSpeakers.entries()) {
        const finalizedMessage = await runSingleSpeakerReply({
          ctx,
          room,
          runtimeRoom,
          speaker,
          speakerIndex,
          speakerCount: currentSpeakers.length,
          currentSpeakerRunIndex: speakerRunIndex++,
          activeContinuationInteractionIds,
          continuationInstruction: continuationInstructionBySpeakerId.get(speaker.id),
          directorReason,
          directorNonverbalReplyIds,
          selectedReplyOption,
          text,
          references,
          turnMessages,
          runtimeMessages,
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

    latestPendingInteractions = extractTavernPendingInteractionsFromMessages({
      messages: turnMessages,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
      turnId: userMessage.turnId ?? userMessage.id,
    }).filter((interaction) => !closedInteractionIds.has(interaction.id));
    const continuationPlan = room.settings.continuation.enabled &&
        !shouldSuppressTavernAutoContinuation(runtimeRoom)
      ? planTavernContinuation({
          pendingInteractions: latestPendingInteractions,
          characters: availableRoomCharacters,
          continuationRound,
          maxAutoContinuationRounds: room.settings.continuation.maxAutoContinuationRounds,
          maxSpeakersPerContinuation: room.settings.continuation.maxSpeakersPerContinuation,
          stopWhenUserTargeted: room.settings.continuation.stopWhenUserTargeted,
        })
      : {
          shouldContinue: false,
          speakerIds: [],
          interactionIds: [],
          reason: "none" as const,
        };

    if (!continuationPlan.shouldContinue) {
      break;
    }

    continuationRound += 1;
    currentContinuationInteractionIds = continuationPlan.interactionIds;
    for (const interactionId of continuationPlan.interactionIds) {
      closedInteractionIds.add(interactionId);
    }
    const interactionText = latestPendingInteractions.find((interaction) =>
      continuationPlan.interactionIds.includes(interaction.id)
    )?.text;
    speakerQueue = continuationPlan.speakerIds
      .map((characterId) => availableRoomCharacters.find((character) => character.id === characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
    for (const speaker of speakerQueue) {
      continuationInstructionBySpeakerId.set(
        speaker.id,
        interactionText
          ? `回应刚才指向你的待回应事项：「${interactionText}」。`
          : "回应刚才指向你的待回应事项。",
      );
    }
    if (speakerQueue.length > 0) {
      ctx.setTurnStatus(`自动续调度 ${speakerQueue.map((speaker) => speaker.name).join("、")} 回应待回应事项...`);
      ctx.appendExecutionStep({
        id: `continuation-${continuationRound}`,
        label: "自动续调度",
        detail: speakerQueue.map((speaker) => speaker.name).join("、"),
        status: "done",
      });
    }
  }

  return {
    runtimeMessages,
    turnMessages,
    openPendingInteractions: latestPendingInteractions.filter((interaction) =>
      !closedInteractionIds.has(interaction.id)
    ),
  };
};
