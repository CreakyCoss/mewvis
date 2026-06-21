import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernPageContextValue } from "../../../context";
import { createTavernMessage } from "../../../../storage";
import {
  buildTavernMessageSegments,
  inferTavernMessageKind,
  canTavernCharacterUseNonverbalReply,
  extractTavernPendingInteractionsFromMessages,
  planTavernContinuation,
  shouldSuppressTavernAutoContinuation,
  tavernCharacterAgentRoleId,
} from "../../../../core";
import { compactTavernAgentKnowledge } from "../../../../runtime/bridge-session";
import { getTavernPresentationProfile } from "../../../../presentation-profiles";
import {
  getTavernPresentationContract,
  type TavernPresentationRuntimeContract,
} from "../../../../presentation-contracts";
import {
  hasTavernReplyDialogueText,
  parseTavernReplyText,
} from "../../../../runtime/reply-cleanup";
import { runTavernInnerThought, runTavernReply } from "../../../../runtime/tavern-runner";
import { buildTavernCharacterTurnInstruction } from "../../../../runtime/turn-instruction";
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

type ParsedTavernReply = ReturnType<typeof parseTavernReplyText>;

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
}: {
  ctx: TavernPageContextValue;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
  runtimeModel: RuntimeModelOption;
  turnMessages: TavernMessage[];
  text: string;
  finalText: string;
}) => {
  try {
    return await runTavernInnerThought({
      workspacePath: ctx.workspace.path,
      runtimeAgentId: ctx.runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      activeCharacter: speaker,
      characters: ctx.roomCharacters,
      messages: turnMessages,
      currentUserText: text,
      replyContent: finalText,
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
      runtimeAgentId: ctx.runtimeAgentId,
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
    replyMode: mode.replyMode,
    isDirectorLikeMode: mode.isDirectorLikeMode,
    isManagedMode: mode.isManagedMode,
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

  let result = await runTavernReply({
    workspacePath: ctx.workspace.path,
    runtimeAgentId: ctx.runtimeAgentId,
    runtimeModel: requireTavernRuntimeModelInput(speakerRuntimeModel),
    room: runtimeRoom,
    activeCharacter: speaker,
    characters: ctx.roomCharacters,
    messages: turnMessages,
    references,
    currentUserText: text,
    turnInstruction: effectiveTurnInstruction,
    allowNonverbalReply: nonverbalReplyAllowed,
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
    result = await runTavernReply({
      workspacePath: ctx.workspace.path,
      runtimeAgentId: ctx.runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(speakerRuntimeModel),
      room: runtimeRoom,
      activeCharacter: speaker,
      characters: ctx.roomCharacters,
      messages: turnMessages,
      references,
      currentUserText: text,
      turnInstruction: buildRetryTurnInstruction({
        effectiveTurnInstruction,
        nonverbalReplyAllowed,
        presentationContract,
        speaker,
      }),
      allowNonverbalReply: nonverbalReplyAllowed,
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
      });

      if (finalizedMessage) {
        runtimeMessages = [...runtimeMessages, finalizedMessage];
        turnMessages.push(finalizedMessage);
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
