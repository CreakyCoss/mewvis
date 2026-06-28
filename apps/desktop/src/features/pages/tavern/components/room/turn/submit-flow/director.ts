import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
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
  createTavernMessage,
} from "../../../../message";
import {
  buildTavernSchedulingSignals,
  isTavernFixedOrderPhase,
  resolveTavernScheduledSpeakers,
} from "../../../../core";
import { runTavernDirector } from "../../../../runtime/director";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernReplyOption,
  TavernRoom,
  TavernSchedulingSignal,
} from "../../../../types";
import {
  findMissingSpeakerModel,
  requireTavernRuntimeModelInput,
  type TurnMode,
} from "./shared";
import {
  applyTavernCollaborationTraceEvent,
} from "./collaboration-trace";

const TAVERN_ILLUSTRATION_HINT_LIMIT = 24;

const formatTavernSchedulingSignalTrace = (
  signals: TavernSchedulingSignal[],
  characters: TavernCharacter[],
) => {
  const characterNameById = new Map(characters.map((character) => [character.id, character.name]));
  const topSignals = signals
    .filter((signal) => signal.score > 0)
    .slice(0, 3);

  if (topSignals.length === 0) {
    return "未命中明显调度动机。";
  }

  return topSignals.map((signal) => {
    const name = characterNameById.get(signal.characterId) ?? signal.characterId;
    const reasons = signal.reasons.slice(0, 2).join("、") || "常规承接";
    const modes = signal.suggestedModes.length > 0
      ? `；建议：${signal.suggestedModes.map((mode) =>
          mode === "speech" ? "发言" : mode === "nonverbal" ? "动作" : "旁观"
        ).join("/")}`
      : "";
    return `${name} ${signal.score}：${reasons}${modes}`;
  }).join("；");
};

export const runDirectorTurn = async ({
  ctx,
  room,
  runtimeRoom,
  runtimeMessages,
  turnMessages,
  references,
  text,
  userMessage,
  mode,
  selectedReplyOption,
  availableRoomCharacters,
  availableActiveCharacter,
  runtimeModel,
  storyContext,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  references: TavernReferencedFile[];
  text: string;
  userMessage: TavernMessage;
  mode: TurnMode;
  selectedReplyOption?: TavernReplyOption;
  availableRoomCharacters: TavernCharacter[];
  availableActiveCharacter: TavernCharacter | null;
  runtimeModel: RuntimeModelOption;
  storyContext: StoryContextPackage;
}) => {
  // 导演阶段统一处理：决定发言顺序，并把旁白、随机事件、环境动作和插图提示落地。
  ctx.setTurnStatus("导演正在判断本轮发言顺序...");
  const schedulingSignals = buildTavernSchedulingSignals({
    room: runtimeRoom,
    characters: availableRoomCharacters,
    messages: runtimeMessages,
    currentUserText: text,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
  });
  const schedulingSignalTrace = formatTavernSchedulingSignalTrace(
    schedulingSignals,
    availableRoomCharacters,
  );
  ctx.appendExecutionStep({
    id: "director",
    label: "导演调度",
    detail: `动态动机：${schedulingSignalTrace}`,
    status: "running",
  });
  const directorDecision = await runTavernDirector({
    workspacePath: ctx.workspace.path,
    runtimeAgentId: ctx.runtimeAgentId,
    runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
    room: runtimeRoom,
    characters: availableRoomCharacters,
    messages: runtimeMessages,
    references,
    currentUserText: text,
    turnTrigger: mode.isSceneDriveMode
      ? { type: "scene_drive", directive: text }
      : { type: "user" },
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    maxSpeakers: isTavernFixedOrderPhase(runtimeRoom)
      ? Math.max(1, availableRoomCharacters.length)
      : Math.min(
          room.settings.directorMaxSpeakers,
          Math.max(1, ctx.roomCharacters.length),
        ),
    storyContext,
    onCollaborationEvent: (event) => {
      applyTavernCollaborationTraceEvent(ctx, event, {
        scopeLabel: "导演",
      });
    },
  });
  const directorNonverbalReplyIds = directorDecision.nonverbalReplyIds ?? [];
  const speakers = resolveTavernScheduledSpeakers({
    room: runtimeRoom,
    availableCharacters: availableRoomCharacters,
    activeCharacterId: ctx.activeCharacter?.id,
    directorSpeakerIds: directorDecision.speakerIds,
    directorNonverbalReplyIds,
    selectedTargetCharacterIds: selectedReplyOption?.targetCharacterIds,
    currentUserText: text,
    fallbackCharacter: availableActiveCharacter,
  });
  const missingDirectedModel = findMissingSpeakerModel(speakers, runtimeModel);
  if (missingDirectedModel) {
    throw new Error(`角色 ${missingDirectedModel.name} 还没有可用模型。`);
  }

  const directorReason = directorDecision.reason ?? "";
  ctx.setTurnStatus(speakers.length > 0
    ? `导演安排 ${speakers.map((speaker) => speaker.name).join("、")} 发言。`
    : "导演仅推进公开流程。");
  ctx.patchExecutionStep("director", {
    status: "done",
    detail: speakers.length > 0
      ? `${speakers.map((speaker) => speaker.name).join(" -> ")}；${schedulingSignalTrace}`
      : `仅旁白/阶段推进；${schedulingSignalTrace}`,
  });

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

  const narratorText = directorDecision.narrator?.trim();
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

  const randomEventText = directorDecision.randomEvent?.trim();
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

  const ambientActionMessages = (directorDecision.ambientActions ?? [])
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
    ? (directorDecision.illustrationHints ?? [])
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
    ].slice(-TAVERN_ILLUSTRATION_HINT_LIMIT);
    runtimeRoom = syncTavernRoomActiveScene({
      ...projectTavernSceneOntoRoom(runtimeRoom),
      illustrationHints: nextIllustrationHints,
      updatedAt: Date.now(),
    });
    ctx.patchRoom(room.id, {
      illustrationHints: nextIllustrationHints,
    });
    ctx.patchExecutionStep("director", {
      status: "done",
      detail: `${speakers.length > 0 ? speakers.map((speaker) => speaker.name).join(" -> ") : "仅旁白/阶段推进"}；${schedulingSignalTrace}；插图 ${illustrationHints.length} 条`,
    });
  }

  return {
    speakers,
    runtimeRoom,
    runtimeMessages,
    turnMessages,
    turnNarratorTexts,
    directorReason,
    directorNonverbalReplyIds,
  };
};
