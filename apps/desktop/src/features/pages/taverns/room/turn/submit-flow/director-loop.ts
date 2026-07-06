import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { AgentClientCollaborationEvent } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernRoomContextValue } from "@/features/pages/taverns/room/context";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { createTavernIllustrationHint } from "@/features/pages/taverns/tavern/factories/asset-factories";
import {
  buildTavernMessageSegments,
  createTavernMessage,
  inferTavernMessageKind,
  parseTavernReplyText,
} from "@/features/pages/taverns/tavern/message";
import {
  extractTavernPendingInteractionsFromMessages,
  resolveTavernScheduledSpeakers,
  tavernCharacterAgentRoleId,
} from "@/features/pages/taverns/tavern/core";
import {
  buildTavernDirectorLoopCollaborationInput,
  runTavernCollaboration,
} from "@/features/pages/taverns/tavern/runtime/collaboration";
import { resolveTavernCharacterModel } from "@/features/pages/taverns/tavern/runtime/agent";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter, TavernReplyOption, TavernRoom } from "@/features/pages/taverns/manage/model";
import { findMissingSpeakerModel, requireTavernRuntimeModelInput, type ActiveReplyRef, type TurnMode } from "./shared";
import { applyTavernCollaborationTraceEvent } from "./collaboration-trace";

const TAVERN_LOOP_ILLUSTRATION_HINT_LIMIT = 24;

type LoopSpeakerRuntime = {
  executionStepId: string;
  message: TavernMessage;
  speaker: TavernCharacter;
  text: string;
};

type TavernLoopSupervisorDecision = {
  speakerIds: string[];
  nonverbalReplyIds?: string[];
  narrator?: string;
  randomEvent?: string;
  illustrationHints?: string[];
  ambientActions?: Array<{
    characterId: string;
    action: string;
  }>;
  reason?: string;
};

export const shouldRunTavernDirectorLoopWorkflow = ({
  availableRoomCharacters,
  mode,
  room,
}: {
  availableRoomCharacters: TavernCharacter[];
  mode: TurnMode;
  room: TavernRoom;
}) => mode.isDirectorLikeMode && room.settings.directorLoop.enabled && availableRoomCharacters.length > 0;

export const runDirectorLoopTurn = async ({
  activeReplyRef,
  availableActiveCharacter,
  availableRoomCharacters,
  ctx,
  mode,
  references,
  room,
  runtimeMessages,
  runtimeModel,
  runtimeRoom,
  selectedReplyOption,
  storyContext,
  text,
  turnMessages,
  userMessage,
}: {
  activeReplyRef: ActiveReplyRef;
  availableActiveCharacter: TavernCharacter | null;
  availableRoomCharacters: TavernCharacter[];
  ctx: TavernRoomContextValue;
  mode: TurnMode;
  references: TavernReferencedFile[];
  room: TavernRoom;
  runtimeMessages: TavernMessage[];
  runtimeModel: RuntimeModelOption;
  runtimeRoom: TavernRoom;
  selectedReplyOption?: TavernReplyOption;
  storyContext: TavernStoryContextPackage;
  text: string;
  turnMessages: TavernMessage[];
  userMessage: TavernMessage;
}) => {
  const maxRounds = resolveDirectorLoopMaxRounds(runtimeRoom);
  ctx.setTurnStatus("导演正在进行回环调度...");
  ctx.appendExecutionStep({
    id: "director-loop",
    label: "导演回环",
    detail: maxRounds > 1 ? `最多 ${maxRounds} 轮` : "单轮动态调度",
    status: "running",
  });

  const activeSpeakerRuntimeByRoleId = new Map<string, LoopSpeakerRuntime>();
  const speakerByRoleId = new Map(
    availableRoomCharacters.map((speaker) => [tavernCharacterAgentRoleId(runtimeRoom, speaker), speaker]),
  );
  const characterIdByRoleId = new Map(
    availableRoomCharacters.map((speaker) => [tavernCharacterAgentRoleId(runtimeRoom, speaker), speaker.id]),
  );
  const agentRoleLabelById = Object.fromEntries(
    availableRoomCharacters.map((speaker) => [tavernCharacterAgentRoleId(runtimeRoom, speaker), speaker.name]),
  );
  let latestSupervisorDecision: TavernLoopSupervisorDecision | undefined;
  let directorReason = "";
  let directorNonverbalReplyIds: string[] = [];
  let turnNarratorTexts: string[] = [];

  const handleEvent = (event: AgentClientCollaborationEvent) => {
    applyTavernCollaborationTraceEvent(ctx, event, {
      scopeLabel: "导演回环",
      agentRoleLabelById,
    });

    if (event.type === "step_started" && event.agentRoleId) {
      const speaker = speakerByRoleId.get(event.agentRoleId);
      if (!speaker) {
        return;
      }
      const speakerRuntime = startLoopSpeakerRuntime({
        activeReplyRef,
        ctx,
        room,
        runtimeRoom,
        speaker,
      });
      activeSpeakerRuntimeByRoleId.set(event.agentRoleId, speakerRuntime);
      return;
    }

    if (event.type === "agent_event" && event.agentRoleId) {
      const speakerRuntime = activeSpeakerRuntimeByRoleId.get(event.agentRoleId);
      if (!speakerRuntime || event.event.type !== "text_delta" || typeof event.event.delta !== "string") {
        return;
      }
      appendLoopSpeakerDelta({
        activeReplyRef,
        ctx,
        delta: event.event.delta,
        runtime: speakerRuntime,
        runtimeRoom,
      });
      return;
    }

    if (event.type !== "step_done") {
      return;
    }

    if (event.step.outputKey === "supervisorDecision") {
      const decision = normalizeLoopSupervisorDecision(event.step.output, characterIdByRoleId);
      if (!decision) {
        return;
      }
      latestSupervisorDecision = decision;
      const directorEffects = applyLoopSupervisorDecision({
        availableActiveCharacter,
        availableRoomCharacters,
        ctx,
        decision,
        room,
        runtimeMessages,
        runtimeModel,
        runtimeRoom,
        selectedReplyOption,
        text,
        turnMessages,
        userMessage,
      });
      runtimeMessages = directorEffects.runtimeMessages;
      runtimeRoom = directorEffects.runtimeRoom;
      turnMessages = directorEffects.turnMessages;
      turnNarratorTexts = [...turnNarratorTexts, ...directorEffects.turnNarratorTexts];
      directorReason = decision.reason ?? directorReason;
      directorNonverbalReplyIds = decision.nonverbalReplyIds ?? [];
      return;
    }

    if (!event.step.agentRoleId) {
      return;
    }
    const speakerRuntime = activeSpeakerRuntimeByRoleId.get(event.step.agentRoleId);
    if (!speakerRuntime) {
      return;
    }
    const finalizedMessage = finalizeLoopSpeakerRuntime({
      activeReplyRef,
      ctx,
      outputText: event.step.text,
      runtime: speakerRuntime,
      runtimeRoom,
    });
    activeSpeakerRuntimeByRoleId.delete(event.step.agentRoleId);
    runtimeMessages = [...runtimeMessages, finalizedMessage];
    turnMessages.push(finalizedMessage);
  };

  await runTavernCollaboration({
    ...buildTavernDirectorLoopCollaborationInput({
      workspacePath: ctx.workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      characters: availableRoomCharacters,
      speakerInputs: availableRoomCharacters.map((speaker, index) => ({
        character: speaker,
        runtimeModel: resolveRequiredSpeakerRuntimeModel({
          runtimeModel,
          speaker,
        }),
        turnInstruction: [
          `这是导演动态协作中的第 ${index + 1} 个候选角色。`,
          "只有被导演本轮调度时才回应；承接同一 workflow 已公开发生的角色输出。",
        ].join("\n"),
        allowNonverbalReply: true,
      })),
      messages: runtimeMessages,
      references,
      currentUserText: text,
      turnTrigger: mode.isSceneDriveMode ? { type: "scene_drive", directive: text } : { type: "user" },
      selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
      maxSpeakers: Math.min(room.settings.directorMaxSpeakers, Math.max(1, ctx.roomCharacters.length)),
      maxRounds,
      storyContext,
    }),
    onEvent: handleEvent,
  });

  ctx.patchExecutionStep("director-loop", {
    status: "done",
    detail: latestSupervisorDecision?.reason ?? "回环调度完成",
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return {
    supervisorDecision: latestSupervisorDecision,
    directorNonverbalReplyIds,
    directorReason,
    runtimeMessages,
    runtimeRoom,
    turnMessages,
    turnNarratorTexts,
    openPendingInteractions: extractTavernPendingInteractionsFromMessages({
      messages: turnMessages,
      characters: ctx.roomCharacters,
      userPersonaName: runtimeRoom.userPersonaName,
      turnId: userMessage.turnId ?? userMessage.id,
    }),
  };
};

const resolveDirectorLoopMaxRounds = (room: TavernRoom) =>
  room.settings.directorLoop.enabled ? Math.max(1, Math.floor(room.settings.directorLoop.maxRounds)) : 1;

const resolveRequiredSpeakerRuntimeModel = ({
  runtimeModel,
  speaker,
}: {
  runtimeModel: RuntimeModelOption;
  speaker: TavernCharacter;
}) => {
  const resolvedModel = resolveTavernCharacterModel({
    fallbackRuntimeModel: runtimeModel,
  });
  if (!resolvedModel) {
    throw new Error(`角色 ${speaker.name} 还没有可用模型。`);
  }
  return requireTavernRuntimeModelInput(resolvedModel.runtimeModel);
};

const startLoopSpeakerRuntime = ({
  activeReplyRef,
  ctx,
  room,
  runtimeRoom,
  speaker,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  speaker: TavernCharacter;
}): LoopSpeakerRuntime => {
  ctx.setTurnStatus(`${speaker.name} 正在按导演回环回应...`);
  const replyMessage = createTavernMessage({
    roomId: room.id,
    role: "character",
    characterId: speaker.id,
    presentationProfileId: runtimeRoom.presentation?.profileId,
    content: "",
    status: "streaming",
  });
  const executionStepId = `director-loop-speaker-${speaker.id}-${replyMessage.id}`;
  ctx.appendExecutionStep({
    id: executionStepId,
    label: `${speaker.name} 回环回复`,
    detail: "导演回环 workflow",
    status: "running",
  });
  ctx.appendMessagesToRoom(room.id, [replyMessage]);
  activeReplyRef.message = replyMessage;
  activeReplyRef.text = "";

  return {
    executionStepId,
    message: replyMessage,
    speaker,
    text: "",
  };
};

const appendLoopSpeakerDelta = ({
  activeReplyRef,
  ctx,
  delta,
  runtime,
  runtimeRoom,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomContextValue;
  delta: string;
  runtime: LoopSpeakerRuntime;
  runtimeRoom: TavernRoom;
}) => {
  runtime.text += delta;
  const parsed = parseTavernReplyText({
    text: runtime.text,
    activeCharacter: runtime.speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });
  activeReplyRef.message = runtime.message;
  activeReplyRef.text = parsed.content;
  ctx.patchMessage(runtime.message.id, {
    content: parsed.content,
    thought: parsed.thought,
    status: "streaming",
  });
};

const finalizeLoopSpeakerRuntime = ({
  activeReplyRef,
  ctx,
  outputText,
  runtime,
  runtimeRoom,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernRoomContextValue;
  outputText: string;
  runtime: LoopSpeakerRuntime;
  runtimeRoom: TavernRoom;
}): TavernMessage => {
  const parsed = parseTavernReplyText({
    text: outputText || runtime.text,
    activeCharacter: runtime.speaker,
    characters: ctx.roomCharacters,
    userPersonaName: runtimeRoom.userPersonaName,
  });
  const finalText = parsed.content.trim() || "（对方短暂沉默，杯沿映着灯光。）";
  const finalizedMessage: TavernMessage = {
    ...runtime.message,
    content: finalText,
    thought: parsed.thought,
    kind: inferTavernMessageKind({
      role: runtime.message.role,
      presentationProfileId: runtime.message.presentationProfileId,
    }),
    segments: buildTavernMessageSegments({
      ...runtime.message,
      content: finalText,
      thought: parsed.thought,
    }),
    status: "done",
  };
  ctx.patchMessage(runtime.message.id, {
    content: finalizedMessage.content,
    thought: finalizedMessage.thought,
    segments: finalizedMessage.segments,
    status: "done",
  });
  ctx.patchExecutionStep(runtime.executionStepId, {
    status: "done",
    detail: finalText.slice(0, 120),
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return finalizedMessage;
};

const applyLoopSupervisorDecision = ({
  availableActiveCharacter,
  availableRoomCharacters,
  ctx,
  decision,
  room,
  runtimeMessages,
  runtimeModel,
  runtimeRoom,
  selectedReplyOption,
  text,
  turnMessages,
  userMessage,
}: {
  availableActiveCharacter: TavernCharacter | null;
  availableRoomCharacters: TavernCharacter[];
  ctx: TavernRoomContextValue;
  decision: TavernLoopSupervisorDecision;
  room: TavernRoom;
  runtimeMessages: TavernMessage[];
  runtimeModel: RuntimeModelOption;
  runtimeRoom: TavernRoom;
  selectedReplyOption?: TavernReplyOption;
  text: string;
  turnMessages: TavernMessage[];
  userMessage: TavernMessage;
}) => {
  const directorNonverbalReplyIds = decision.nonverbalReplyIds ?? [];
  const speakers = resolveTavernScheduledSpeakers({
    room: runtimeRoom,
    availableCharacters: availableRoomCharacters,
    activeCharacterId: ctx.activeCharacter?.id,
    directorSpeakerIds: decision.speakerIds,
    directorNonverbalReplyIds,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    currentUserText: text,
    fallbackCharacter: availableActiveCharacter,
  });
  const missingDirectedModel = findMissingSpeakerModel(speakers, runtimeModel);
  if (missingDirectedModel) {
    throw new Error(`角色 ${missingDirectedModel.name} 还没有可用模型。`);
  }

  ctx.setTurnStatus(
    speakers.length > 0
      ? `导演继续安排 ${speakers.map((speaker) => speaker.name).join("、")} 发言。`
      : "导演回环判断结束。",
  );

  const turnNarratorTexts: string[] = [];
  const appendNarratorMessages = (messages: TavernMessage[]) => {
    if (messages.length === 0) {
      return;
    }
    ctx.appendMessagesToRoom(room.id, messages);
    runtimeMessages = [...runtimeMessages, ...messages];
    turnMessages.push(...messages);
    turnNarratorTexts.push(...messages.map((message) => message.content));
  };

  const narratorText = decision.narrator?.trim();
  appendNarratorMessages(
    narratorText
      ? [
          createTavernMessage({
            roomId: room.id,
            role: "narrator",
            presentationProfileId: runtimeRoom.presentation?.profileId,
            content: narratorText,
            status: "done",
          }),
        ]
      : [],
  );

  const randomEventText = decision.randomEvent?.trim();
  appendNarratorMessages(
    randomEventText
      ? [
          createTavernMessage({
            roomId: room.id,
            role: "narrator",
            presentationProfileId: runtimeRoom.presentation?.profileId,
            content: randomEventText,
            status: "done",
          }),
        ]
      : [],
  );

  const ambientActionMessages = (decision.ambientActions ?? [])
    .map((action) => {
      const actionText = action.action.trim();
      if (!actionText) {
        return null;
      }
      return createTavernMessage({
        roomId: room.id,
        role: "narrator",
        characterId: action.characterId,
        presentationProfileId: runtimeRoom.presentation?.profileId,
        content: actionText,
        status: "done",
      });
    })
    .filter((message): message is TavernMessage => Boolean(message));
  appendNarratorMessages(ambientActionMessages);

  const illustrationSourceMessageIds =
    userMessage.role === "user" ? [userMessage.id] : turnMessages.map((message) => message.id).slice(-4);
  const illustrationHints = room.settings.illustrationHints.enabled
    ? (decision.illustrationHints ?? [])
        .map((hint) => hint.trim())
        .filter(Boolean)
        .map((prompt) =>
          createTavernIllustrationHint({
            prompt,
            turnId: userMessage.turnId ?? userMessage.id,
            sourceMessageIds: illustrationSourceMessageIds,
          }),
        )
    : [];
  if (illustrationHints.length > 0) {
    const nextIllustrationHints = [...runtimeRoom.illustrationHints, ...illustrationHints].slice(
      -TAVERN_LOOP_ILLUSTRATION_HINT_LIMIT,
    );
    runtimeRoom = syncTavernRoomActiveScene({
      ...projectTavernSceneOntoRoom(runtimeRoom),
      illustrationHints: nextIllustrationHints,
      updatedAt: Date.now(),
    });
    ctx.patchRoom(room.id, {
      illustrationHints: nextIllustrationHints,
    });
  }

  return {
    runtimeMessages,
    runtimeRoom,
    turnMessages,
    turnNarratorTexts,
  };
};

const normalizeLoopSupervisorDecision = (
  value: unknown,
  characterIdByRoleId: Map<string, string>,
): TavernLoopSupervisorDecision | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const selectedTargetId = readOptionalString(record.selectedTargetId);
  const selectedCharacterId = selectedTargetId
    ? resolveSupervisorTargetCharacterId(selectedTargetId, characterIdByRoleId)
    : null;
  const speakerIds = selectedCharacterId ? [selectedCharacterId] : [];
  const artifacts = normalizeSupervisorArtifacts(record.artifacts, characterIdByRoleId);

  return {
    speakerIds,
    nonverbalReplyIds: [],
    narrator: artifacts.narrator,
    randomEvent: artifacts.randomEvent,
    illustrationHints: artifacts.illustrationHints,
    ambientActions: artifacts.ambientActions,
    reason: readOptionalString(record.reason),
  };
};

const normalizeSupervisorArtifacts = (value: unknown, characterIdByRoleId: Map<string, string>) => {
  const result: Pick<
    TavernLoopSupervisorDecision,
    "ambientActions" | "illustrationHints" | "narrator" | "randomEvent"
  > = {
    ambientActions: [],
    illustrationHints: [],
    narrator: undefined,
    randomEvent: undefined,
  };
  if (!Array.isArray(value)) {
    return result;
  }

  const narratorTexts: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const artifact = item as Record<string, unknown>;
    const type = readOptionalString(artifact.type);
    const content = readOptionalString(artifact.content);
    if (!type || !content) {
      continue;
    }
    if (type === "narrator") {
      narratorTexts.push(content);
      continue;
    }
    if (type === "randomEvent") {
      result.randomEvent ??= content;
      continue;
    }
    if (type === "illustrationHint") {
      result.illustrationHints?.push(content);
      continue;
    }
    if (type === "ambientAction") {
      const targetId = readOptionalString(artifact.targetId);
      const characterId = targetId ? resolveSupervisorTargetCharacterId(targetId, characterIdByRoleId) : null;
      if (characterId) {
        result.ambientActions?.push({
          characterId,
          action: content,
        });
      }
    }
  }

  result.narrator = narratorTexts.join("\n").trim() || undefined;
  return result;
};

const resolveSupervisorTargetCharacterId = (targetId: string, characterIdByRoleId: Map<string, string>) =>
  characterIdByRoleId.get(targetId) ?? (Array.from(characterIdByRoleId.values()).includes(targetId) ? targetId : null);

const readOptionalString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
