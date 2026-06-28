import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { AgentClientCollaborationEvent } from "@/agent-client/contracts";
import type { StoryContextPackage } from "@/features/story";
import type { TavernPageContextValue } from "../../../context";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../../../../runtime/active-scene-runtime";
import {
  createTavernIllustrationHint,
} from "../../../../factories/asset-factories";
import {
  buildTavernMessageSegments,
  createTavernMessage,
  inferTavernMessageKind,
  parseTavernReplyText,
} from "../../../../message";
import {
  extractTavernPendingInteractionsFromMessages,
  resolveTavernScheduledSpeakers,
  tavernCharacterAgentRoleId,
} from "../../../../core";
import {
  buildTavernDirectorLoopCollaborationInput,
  runTavernCollaboration,
} from "../../../../runtime/collaboration";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
} from "../../../../types";
import type {
  TavernDirectorDecision,
} from "../../../../runtime/director";
import {
  findMissingSpeakerModel,
  requireTavernRuntimeModelInput,
  type ActiveReplyRef,
  type TurnMode,
} from "./shared";
import {
  applyTavernCollaborationTraceEvent,
} from "./collaboration-trace";

const TAVERN_LOOP_ILLUSTRATION_HINT_LIMIT = 24;
const TAVERN_DIRECTOR_LOOP_MAX_ROUNDS = 2;

type LoopSpeakerRuntime = {
  executionStepId: string;
  message: TavernMessage;
  speaker: TavernCharacter;
  text: string;
};

export const isTavernDirectorLoopWorkflowEnabled = () => {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }).env;
  return env?.VITE_TAVERN_DIRECTOR_LOOP_WORKFLOW === "1" ||
    env?.VITE_TAVERN_DIRECTOR_LOOP_WORKFLOW === true;
};

export const shouldRunTavernDirectorLoopWorkflow = ({
  availableRoomCharacters,
  mode,
  room,
}: {
  availableRoomCharacters: TavernCharacter[];
  mode: TurnMode;
  room: TavernRoom;
}) =>
  isTavernDirectorLoopWorkflowEnabled() &&
  mode.isDirectorLikeMode &&
  availableRoomCharacters.length > 0 &&
  !room.settings.continuation.enabled;

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
  ctx: TavernPageContextValue;
  mode: TurnMode;
  references: TavernReferencedFile[];
  room: TavernRoom;
  runtimeMessages: TavernMessage[];
  runtimeModel: RuntimeModelOption;
  runtimeRoom: TavernRoom;
  selectedReplyOption?: TavernReplyOption;
  storyContext: StoryContextPackage;
  text: string;
  turnMessages: TavernMessage[];
  userMessage: TavernMessage;
}) => {
  ctx.setTurnStatus("导演正在进行回环调度...");
  ctx.appendExecutionStep({
    id: "director-loop",
    label: "导演回环",
    detail: `最多 ${TAVERN_DIRECTOR_LOOP_MAX_ROUNDS} 轮`,
    status: "running",
  });

  const activeSpeakerRuntimeByRoleId = new Map<string, LoopSpeakerRuntime>();
  const speakerByRoleId = new Map(
    availableRoomCharacters.map((speaker) => [
      tavernCharacterAgentRoleId(runtimeRoom, speaker),
      speaker,
    ]),
  );
  const agentRoleLabelById = Object.fromEntries(
    availableRoomCharacters.map((speaker) => [
      tavernCharacterAgentRoleId(runtimeRoom, speaker),
      speaker.name,
    ]),
  );
  let latestDirectorDecision: TavernDirectorDecision | undefined;
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
      if (
        !speakerRuntime ||
        event.event.type !== "text_delta" ||
        typeof event.event.delta !== "string"
      ) {
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

    if (event.step.outputKey === "directorDecision") {
      const decision = normalizeLoopDirectorDecision(event.step.output);
      if (!decision) {
        return;
      }
      latestDirectorDecision = decision;
      const directorEffects = applyLoopDirectorDecision({
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
      runtimeAgentId: ctx.runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      characters: availableRoomCharacters,
      speakers: availableRoomCharacters,
      messages: runtimeMessages,
      references,
      currentUserText: text,
      turnTrigger: mode.isSceneDriveMode
        ? { type: "scene_drive", directive: text }
        : { type: "user" },
      selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
      maxSpeakers: Math.min(
        room.settings.directorMaxSpeakers,
        Math.max(1, ctx.roomCharacters.length),
      ),
      maxRounds: TAVERN_DIRECTOR_LOOP_MAX_ROUNDS,
      storyContext,
      allowNonverbalReplyCharacterIds: latestDirectorDecision?.nonverbalReplyIds ?? [],
      turnInstructionByCharacterId: Object.fromEntries(
        availableRoomCharacters.map((speaker, index) => [
          speaker.id,
          [
            `这是导演回环协作中的第 ${index + 1} 个候选角色。`,
            "如果本轮没有被导演调度，此 step 会被条件跳过；如果被调度，只回应自己可见信息。",
          ].join("\n"),
        ]),
      ),
    }),
    onEvent: handleEvent,
  });

  ctx.patchExecutionStep("director-loop", {
    status: "done",
    detail: latestDirectorDecision?.reason ?? "回环调度完成",
  });
  activeReplyRef.message = null;
  activeReplyRef.text = "";

  return {
    directorDecision: latestDirectorDecision,
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

const startLoopSpeakerRuntime = ({
  activeReplyRef,
  ctx,
  room,
  runtimeRoom,
  speaker,
}: {
  activeReplyRef: ActiveReplyRef;
  ctx: TavernPageContextValue;
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
  ctx: TavernPageContextValue;
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
  ctx: TavernPageContextValue;
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

const applyLoopDirectorDecision = ({
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
  ctx: TavernPageContextValue;
  decision: TavernDirectorDecision;
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

  ctx.setTurnStatus(speakers.length > 0
    ? `导演继续安排 ${speakers.map((speaker) => speaker.name).join("、")} 发言。`
    : "导演回环判断结束。");

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
  appendNarratorMessages(narratorText
    ? [
        createTavernMessage({
          roomId: room.id,
          role: "narrator",
          presentationProfileId: runtimeRoom.presentation?.profileId,
          content: narratorText,
          status: "done",
        }),
      ]
    : []);

  const randomEventText = decision.randomEvent?.trim();
  appendNarratorMessages(randomEventText
    ? [
        createTavernMessage({
          roomId: room.id,
          role: "narrator",
          presentationProfileId: runtimeRoom.presentation?.profileId,
          content: randomEventText,
          status: "done",
        }),
      ]
    : []);

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

  const illustrationSourceMessageIds = userMessage.role === "user"
    ? [userMessage.id]
    : turnMessages.map((message) => message.id).slice(-4);
  const illustrationHints = room.settings.illustrationHints.enabled
    ? (decision.illustrationHints ?? [])
        .map((hint) => hint.trim())
        .filter(Boolean)
        .map((prompt) => createTavernIllustrationHint({
          prompt,
          turnId: userMessage.turnId ?? userMessage.id,
          sourceMessageIds: illustrationSourceMessageIds,
        }))
    : [];
  if (illustrationHints.length > 0) {
    const nextIllustrationHints = [
      ...runtimeRoom.illustrationHints,
      ...illustrationHints,
    ].slice(-TAVERN_LOOP_ILLUSTRATION_HINT_LIMIT);
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

const normalizeLoopDirectorDecision = (
  value: unknown,
): TavernDirectorDecision | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    speakerIds: readStringArray(record.speakerIds),
    nonverbalReplyIds: readStringArray(record.nonverbalReplyIds),
    narrator: readOptionalString(record.narrator),
    randomEvent: readOptionalString(record.randomEvent),
    illustrationHints: readStringArray(record.illustrationHints),
    ambientActions: Array.isArray(record.ambientActions)
      ? record.ambientActions.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }
          const action = item as Record<string, unknown>;
          const characterId = readOptionalString(action.characterId);
          const actionText = readOptionalString(action.action);
          return characterId && actionText
            ? [{ characterId, action: actionText }]
            : [];
        })
      : [],
    reason: readOptionalString(record.reason),
  };
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];

const readOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
