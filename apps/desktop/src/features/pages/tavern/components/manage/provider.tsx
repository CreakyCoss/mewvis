import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createAgentClient } from "@/agent-client/runtime";
import { tavernAvatarOptions } from "@/assets/agent-avatars";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
  useLlmSettingsStore,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { normalizeVisualPresetId } from "@/features/pages/tavern/visual-presets";
import { normalizeTavernPromptStyleId } from "../../prompt-styles";
import {
  createTavernProgressCheckpoint,
} from "../../core";
import {
  createTavernAssetDraft,
  createTavernIllustrationHint,
  createTavernLorebookEntry,
  createTavernMessage,
  createTavernRoom,
  createTavernRoomFromGeneratedPresetJson,
  createTavernRoomFromSystemPreset,
  createTavernScene,
  createTavernTimelineEvent,
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  getTavernSystemPreset,
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../../storage";
import { deleteTavernBridgeSession } from "../../runtime/bridge-session";
import { runTavernDirectorProfileAgent } from "../../runtime/director-profile-agent";
import { runTavernTextFieldAgent } from "../../runtime/field-polish-agent";
import type { TavernTextFieldAgentRequest } from "../../runtime/field-polish-agent";
import {
  runTavernGeneratedPresetAgent,
  type TavernGeneratedPresetAgentDraft,
} from "../../runtime/generated-preset-agent";
import { parseTavernExternalImportJson } from "../../import-formats";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCondition,
  TavernEntityRef,
  TavernFactEvent,
  TavernMessage,
  TavernOutcomeEvent,
  TavernProgressCheckpoint,
  TavernRoom,
  TavernRoomSettings,
  TavernScene,
  TavernSceneOutcomeDefinition,
  TavernState,
  TavernStatusEvent,
  TavernStatusTargetRef,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "../../types";
import { sanitizeFileName } from "../room/quick-summary/utils";
import {
  ManagementContextProvider,
  type ManagementContextValue,
} from "./context";

const TAVERN_ROOM_EXPORT_SCHEMA = "novel-claw.tavern-room";
const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const cloneTavernDirectorProfile = (
  profile: TavernRoomSettings["directorScheduling"]["profile"],
): TavernRoomSettings["directorScheduling"]["profile"] => profile
  ? {
      ...profile,
      globalGoals: [...profile.globalGoals],
      globalRules: [...profile.globalRules],
      characterProfiles: Object.fromEntries(
        Object.entries(profile.characterProfiles).map(([characterId, characterProfile]) => [
          characterId,
          {
            ...characterProfile,
            interestTags: [...characterProfile.interestTags],
            goalTags: [...characterProfile.goalTags],
            knowledgeTags: [...characterProfile.knowledgeTags],
            speechTriggers: [...characterProfile.speechTriggers],
            silenceTriggers: [...characterProfile.silenceTriggers],
          },
        ]),
      ),
    }
  : undefined;

const touchTavernRoomActiveScene = (room: TavernRoom): TavernRoom => ({
  ...syncTavernRoomActiveScene({
    ...room,
    updatedAt: Date.now(),
  }),
});

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.timelineEvents.some((event) => event.title.trim() && event.summary.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

type TavernRoomExportV2 = {
  schema: typeof TAVERN_ROOM_EXPORT_SCHEMA;
  version: 2;
  exportedAt: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  messagesByScene: Record<string, TavernMessage[]>;
};

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getRoomActiveSceneId = (room: TavernRoom) =>
  room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getSceneMessages = (
  room: TavernRoom,
  state: Pick<TavernState, "messagesByScene">,
) => {
  const sceneId = getRoomActiveSceneId(room);
  return state.messagesByScene[sceneId] ?? [];
};

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const normalizeImportedRoomSettings = (value: unknown): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_TAVERN_ROOM_SETTINGS };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  return {
    ...DEFAULT_TAVERN_ROOM_SETTINGS,
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    agentKnowledgeCompactIntervalTurns: clampInteger(
      candidate.agentKnowledgeCompactIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.agentKnowledgeCompactIntervalTurns,
      0,
      50,
    ),
    directorScheduling: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling,
      ...(candidate.directorScheduling ?? {}),
      directorOnlyPhaseValues: Array.isArray(candidate.directorScheduling?.directorOnlyPhaseValues)
        ? candidate.directorScheduling.directorOnlyPhaseValues
        : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.directorOnlyPhaseValues,
      speakerMotivation: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation,
        ...(candidate.directorScheduling?.speakerMotivation ?? {}),
        rules: Array.isArray(candidate.directorScheduling?.speakerMotivation?.rules)
          ? candidate.directorScheduling.speakerMotivation.rules
          : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation.rules,
      },
      profile: cloneTavernDirectorProfile(candidate.directorScheduling?.profile),
      fixedOrder: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder,
        ...(candidate.directorScheduling?.fixedOrder ?? {}),
        phaseValues: Array.isArray(candidate.directorScheduling?.fixedOrder?.phaseValues)
          ? candidate.directorScheduling.fixedOrder.phaseValues
          : DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder.phaseValues,
        includeUser: Boolean(candidate.directorScheduling?.fixedOrder?.includeUser),
        userPosition: candidate.directorScheduling?.fixedOrder?.userPosition === "last" ? "last" : "first",
      },
    },
    continuation: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.continuation,
      ...(candidate.continuation ?? {}),
    },
    replyOptions: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions,
      ...(candidate.replyOptions ?? {}),
    },
    statusTracking: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.statusTracking,
      ...(candidate.statusTracking ?? {}),
    },
    randomEvents: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents,
      ...(candidate.randomEvents ?? {}),
    },
    illustrationHints: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.illustrationHints,
      ...(candidate.illustrationHints ?? {}),
    },
    informationPolicy: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy,
      ...(candidate.informationPolicy ?? {}),
      hiddenFacts: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.hiddenFacts,
        ...(candidate.informationPolicy?.hiddenFacts ?? {}),
      },
      roleAssignment: {
        ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment,
        ...(candidate.informationPolicy?.roleAssignment ?? {}),
        rolePool: Array.isArray(candidate.informationPolicy?.roleAssignment?.rolePool)
          ? candidate.informationPolicy.roleAssignment.rolePool
          : DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.rolePool,
        opening: {
          ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.opening,
          ...(candidate.informationPolicy?.roleAssignment?.opening ?? {}),
          globalStatusPatches: Array.isArray(candidate.informationPolicy?.roleAssignment?.opening?.globalStatusPatches)
            ? candidate.informationPolicy.roleAssignment.opening.globalStatusPatches
            : DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.opening.globalStatusPatches,
        },
      },
    },
  };
};

const remapImportedEntityRef = (
  entity: TavernEntityRef | undefined,
  characterIdMap: Map<string, string>,
): TavernEntityRef | undefined => {
  if (!entity) {
    return undefined;
  }

  if (entity.type === "character") {
    const mappedId = characterIdMap.get(entity.characterId);
    return mappedId ? { ...entity, characterId: mappedId } : entity;
  }

  return entity;
};

const remapImportedStatusTarget = (
  target: TavernStatusTargetRef,
  characterIdMap: Map<string, string>,
): TavernStatusTargetRef => {
  if (target.type === "character") {
    const mappedId = characterIdMap.get(target.characterId);
    return mappedId ? { ...target, characterId: mappedId } : target;
  }
  if (target.type === "relationship") {
    return {
      ...target,
      subject: remapImportedEntityRef(target.subject, characterIdMap) ?? target.subject,
      object: remapImportedEntityRef(target.object, characterIdMap) ?? target.object,
    };
  }
  return target;
};

const remapImportedCondition = (
  condition: TavernCondition,
  characterIdMap: Map<string, string>,
): TavernCondition => {
  if ("all" in condition) {
    return { ...condition, all: condition.all.map((item) => remapImportedCondition(item, characterIdMap)) };
  }
  if ("any" in condition) {
    return { ...condition, any: condition.any.map((item) => remapImportedCondition(item, characterIdMap)) };
  }
  if ("not" in condition) {
    return { ...condition, not: remapImportedCondition(condition.not, characterIdMap) };
  }
  if ("status" in condition && "target" in condition) {
    return {
      ...condition,
      target: remapImportedStatusTarget(condition.target, characterIdMap),
    };
  }
  if ("factEvent" in condition) {
    return {
      ...condition,
      ...(condition.actor ? { actor: remapImportedEntityRef(condition.actor, characterIdMap) } : {}),
      ...(condition.target ? { target: remapImportedEntityRef(condition.target, characterIdMap) } : {}),
    };
  }
  if ("task" in condition) {
    return {
      ...condition,
      ...(condition.owner ? { owner: remapImportedEntityRef(condition.owner, characterIdMap) } : {}),
    };
  }
  return condition;
};

const remapImportedCharacterIds = (
  ids: string[] | undefined,
  characterIdMap: Map<string, string>,
) => ids?.flatMap((id) => {
  const mappedId = characterIdMap.get(id);
  return mappedId ? [mappedId] : [];
});

const remapImportedFactEvents = (
  factEvents: TavernFactEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(factEvents)
  ? factEvents.map((event) => ({
      ...event,
      ...(event.actor ? { actor: remapImportedEntityRef(event.actor, characterIdMap) } : {}),
      ...(event.target ? { target: remapImportedEntityRef(event.target, characterIdMap) } : {}),
      ...(event.visibleToCharacterIds
        ? { visibleToCharacterIds: remapImportedCharacterIds(event.visibleToCharacterIds, characterIdMap) }
        : {}),
    }))
  : [];

const remapImportedStatusEvents = (
  statusEvents: TavernStatusEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(statusEvents)
  ? statusEvents.map((event) => ({
      ...event,
      target: remapImportedStatusTarget(event.target, characterIdMap),
    }))
  : [];

const remapImportedTaskDefinitions = (
  tasks: TavernTaskDefinition[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(tasks)
  ? tasks.map((task) => ({
      ...task,
      owner: remapImportedEntityRef(task.owner, characterIdMap) ?? task.owner,
      ...(task.participants
        ? { participants: task.participants.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      lifecycle: {
        ...task.lifecycle,
        ...(task.lifecycle.startCondition
          ? { startCondition: remapImportedCondition(task.lifecycle.startCondition, characterIdMap) }
          : {}),
        completeCondition: remapImportedCondition(task.lifecycle.completeCondition, characterIdMap),
        ...(task.lifecycle.failCondition
          ? { failCondition: remapImportedCondition(task.lifecycle.failCondition, characterIdMap) }
          : {}),
      },
    }))
  : [];

const remapImportedSceneOutcomes = (
  outcomes: TavernSceneOutcomeDefinition[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(outcomes)
  ? outcomes.map((outcome) => ({
      ...outcome,
      ...(outcome.winner
        ? { winner: outcome.winner.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      ...(outcome.loser
        ? { loser: outcome.loser.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity) }
        : {}),
      condition: remapImportedCondition(outcome.condition, characterIdMap),
    }))
  : [];

const remapImportedOutcomeEvents = (
  events: TavernOutcomeEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(events)
  ? events.map((event) => ({
      ...event,
      winners: event.winners.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity),
      losers: event.losers.map((entity) => remapImportedEntityRef(entity, characterIdMap) ?? entity),
    }))
  : [];

const remapImportedTaskSnapshot = (
  snapshot: Record<string, TavernTaskState> | undefined,
  characterIdMap: Map<string, string>,
) => snapshot
  ? Object.fromEntries(Object.entries(snapshot).map(([taskId, state]) => [
      taskId,
      {
        ...state,
        owner: remapImportedEntityRef(state.owner, characterIdMap) ?? state.owner,
      },
    ]))
  : {};

const remapImportedTaskEvents = (
  events: TavernTaskEvent[] | undefined,
  characterIdMap: Map<string, string>,
) => Array.isArray(events)
  ? events.map((event) => ({
      ...event,
      owner: remapImportedEntityRef(event.owner, characterIdMap) ?? event.owner,
      before: event.before
        ? { ...event.before, owner: remapImportedEntityRef(event.before.owner, characterIdMap) ?? event.before.owner }
        : undefined,
      after: { ...event.after, owner: remapImportedEntityRef(event.after.owner, characterIdMap) ?? event.after.owner },
    }))
  : [];

type ManagementProviderProps = {
  workspace: Workspace;
  state: TavernState;
  setState: Dispatch<SetStateAction<TavernState>>;
  onError?: (message: string) => void;
  onCloseActiveRoom: () => void;
  children: ReactNode;
};

export const ManagementProvider = ({
  workspace,
  state,
  setState,
  onError,
  onCloseActiveRoom,
  children,
}: ManagementProviderProps) => {
  const agentClient = useMemo(() => createAgentClient(), []);
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const [runtimeAgentId, setRuntimeAgentId] = useState("");
  const activeRoom = useMemo(
    () => state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null,
    [state.activeRoomId, state.rooms],
  );
  const characterById = useMemo(() => (
    new Map([
      ...state.rooms.flatMap((room) =>
        (room.localCharacters ?? []).map((character) => [character.id, character] as const)
      ),
    ])
  ), [state.rooms]);
  const messagesByRoomId = useMemo(
    () => Object.fromEntries(
      state.rooms.map((room) => [
        room.id,
        state.messagesByScene[getRoomActiveSceneId(room)] ?? [],
      ]),
    ),
    [state.messagesByScene, state.rooms],
  );
  const runtimeModel = runtimeModels[0] ?? null;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let isCancelled = false;

    void agentClient.listAgents()
      .then((result) => {
        if (!isCancelled) {
          setRuntimeAgentId(result.defaultAgentId || result.agents[0]?.id || "");
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRuntimeAgentId("");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [agentClient]);

  const reportError = useCallback((message: string) => {
    onError?.(message);
  }, [onError]);
  const patchRoom = useCallback((roomId: string, patch: Partial<TavernRoom>) => {
    setState((current) => {
      let patchedRoom: TavernRoom | null = null;
      const nextRooms = current.rooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        patchedRoom = syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(room),
          ...patch,
          updatedAt: Date.now(),
        });
        return patchedRoom;
      });

      if (!patchedRoom) {
        return current;
      }

      return {
        ...current,
        rooms: nextRooms,
      };
    });
  }, [setState]);
  const appendProgressCheckpointToRoom = useCallback((
    room: TavernRoom,
    reason: TavernProgressCheckpoint["reason"],
    turnId?: string,
  ): TavernRoom => {
    const checkpoint = createTavernProgressCheckpoint({
      room,
      turnId,
      reason,
      createdAt: Date.now(),
    });
    return syncTavernRoomActiveScene({
      ...room,
      statusCheckpoints: [...room.statusCheckpoints, checkpoint].slice(-20),
    });
  }, []);

  const clearRoomMessages = useCallback(async (roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (targetRoom?.locked || !targetRoom) {
      return false;
    }

    try {
      await deleteTavernBridgeSession({ workspacePath: workspace.path, room: targetRoom });
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : String(resetError);
      reportError(`无法清理酒馆底层会话：${message}`);
      return false;
    }

    const sceneId = getRoomActiveSceneId(targetRoom);
    const resetMessage = createTavernMessage({
      roomId: targetRoom.id,
      role: "narrator",
      content: "这个场景的桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });
    setState((current) => {
      const currentRoom = current.rooms.find((room) => room.id === targetRoom.id);
      const currentSceneId = currentRoom ? getRoomActiveSceneId(currentRoom) : sceneId;

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === targetRoom.id
            ? appendProgressCheckpointToRoom(
                touchTavernRoomActiveScene(room),
                "before_context_trim",
                resetMessage.id,
              )
            : room,
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [currentSceneId]: [resetMessage],
        },
      };
    });
    reportError("");
    return true;
  }, [appendProgressCheckpointToRoom, reportError, setState, state.rooms, workspace.path]);

  const deleteRoom = useCallback((roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (!targetRoom || targetRoom.locked || state.rooms.length <= 1) {
      return false;
    }

    setState((current) => {
      const currentTargetRoom = current.rooms.find((room) => room.id === roomId);
      if (!currentTargetRoom || currentTargetRoom.locked || current.rooms.length <= 1) {
        return current;
      }

      const nextRooms = current.rooms.filter((room) => room.id !== roomId);
      const nextMessagesByScene = { ...current.messagesByScene };
      for (const scene of currentTargetRoom.scenes ?? []) {
        delete nextMessagesByScene[scene.id];
      }
      const activeRoomId = current.activeRoomId === roomId
        ? nextRooms[0]?.id ?? current.activeRoomId
        : current.activeRoomId;

      return {
        ...current,
        activeRoomId,
        rooms: nextRooms,
        messagesByScene: nextMessagesByScene,
      };
    });
    if (activeRoom?.id === roomId) {
      onCloseActiveRoom();
    }
    return true;
  }, [activeRoom?.id, onCloseActiveRoom, setState, state.rooms]);

  const copyRoom = useCallback((roomId: string) => {
    if (!state.rooms.some((room) => room.id === roomId)) {
      return false;
    }

    setState((current) => {
      const sourceRoom = current.rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return current;
      }

      const createdAt = Date.now();
      const copiedRoomId = createLocalId("room");
      const sourceScenes = sourceRoom.scenes?.length
        ? sourceRoom.scenes
        : [createTavernScene({}, sourceRoom)];
      const sourceCharacterById = new Map([
        ...current.rooms.flatMap((room) =>
          (room.localCharacters ?? []).map((character) => [character.id, character] as const)
        ),
      ]);
      const characterIdMap = new Map<string, string>();
      const referencedCharacterIds = [
        ...new Set(sourceScenes.flatMap((scene) => scene.characterIds)),
      ];
      const copiedCharacters = referencedCharacterIds.flatMap((characterId) => {
        const character = sourceCharacterById.get(characterId);
        if (!character) {
          return [];
        }

        const copiedCharacterId = createLocalId("character");
        characterIdMap.set(character.id, copiedCharacterId);
        return [{
          ...character,
          id: copiedCharacterId,
          systemPresetId: undefined,
          systemPresetCharacterId: undefined,
          systemPresetVersion: undefined,
          createdAt,
          updatedAt: createdAt,
        }];
      });

      const sceneIdMap = new Map<string, string>();
      const sourceTimelineEvents = sourceRoom.timelineEvents;
      const timelineEventIdMap = new Map<string, string>();
      const copiedTimelineEvents = sourceTimelineEvents.map((event) => {
        const copiedEventId = createLocalId("event");
        timelineEventIdMap.set(event.id, copiedEventId);
        return {
          ...event,
          id: copiedEventId,
          createdAt,
          updatedAt: createdAt,
        };
      });
      const remapTimelineScope = (scope: TavernScene["timelineScope"]) => {
        if (scope.mode === "range") {
          return {
            mode: "range" as const,
            startEventId: scope.startEventId ? timelineEventIdMap.get(scope.startEventId) : undefined,
            endEventId: scope.endEventId ? timelineEventIdMap.get(scope.endEventId) : undefined,
          };
        }

        if (scope.mode === "selected") {
          return {
            mode: "selected" as const,
            eventIds: (scope.eventIds ?? []).flatMap((eventId) => {
              const copiedEventId = timelineEventIdMap.get(eventId);
              return copiedEventId ? [copiedEventId] : [];
            }),
          };
        }

        return { mode: "auto" as const };
      };
      const copiedMessagesByScene: Record<string, TavernMessage[]> = {};
      const copiedScenes = sourceScenes.map((scene) => {
        const copiedSceneId = createLocalId("scene");
        sceneIdMap.set(scene.id, copiedSceneId);
        const sourceMessages = current.messagesByScene[scene.id] ?? [];
        const messageIdMap = new Map<string, string>();
        const copiedMessages = sourceMessages.flatMap((message) => {
          const copiedMessageId = createLocalId("message");
          messageIdMap.set(message.id, copiedMessageId);

          if (message.role === "character") {
            const copiedCharacterId = message.characterId
              ? characterIdMap.get(message.characterId)
              : undefined;
            if (!copiedCharacterId) {
              return [];
            }

            return [{
              ...message,
              id: copiedMessageId,
              roomId: copiedRoomId,
              characterId: copiedCharacterId,
              createdAt,
              status: message.status === "streaming" ? "done" as const : message.status,
              referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
            }];
          }

          return [{
            ...message,
            id: copiedMessageId,
            roomId: copiedRoomId,
            createdAt,
            status: message.status === "streaming" ? "done" as const : message.status,
            referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
          }];
        });
        copiedMessagesByScene[copiedSceneId] = copiedMessages.length > 0
          ? copiedMessages
          : [
              createTavernMessage({
                roomId: copiedRoomId,
                role: "narrator",
                content: "这个场景从另一个酒馆复制而来，灯光重新亮起。",
                status: "done",
              }),
            ];
        const characterIds = scene.characterIds.flatMap((characterId) => {
          const copiedCharacterId = characterIdMap.get(characterId);
          return copiedCharacterId ? [copiedCharacterId] : [];
        });
        const characterMemories = Object.fromEntries(
          Object.entries(scene.characterMemories).flatMap(([characterId, memory]) => {
            const copiedCharacterId = characterIdMap.get(characterId);
            return copiedCharacterId && memory.trim() ? [[copiedCharacterId, memory]] : [];
          }),
        );
        const characterConfigs = Object.fromEntries(
          scene.characterIds.flatMap((sourceCharacterId) => {
            const copiedCharacterId = characterIdMap.get(sourceCharacterId);
            if (!copiedCharacterId) {
              return [];
            }
            return [[
              copiedCharacterId,
              {
                characterId: copiedCharacterId,
                memory: characterMemories[copiedCharacterId],
              },
            ]];
          }),
        );

        return {
          ...scene,
          id: copiedSceneId,
          characterConfigs,
          characterMemories,
          timelineScope: remapTimelineScope(scene.timelineScope),
          illustrationHints: scene.illustrationHints.map((hint) => ({
            ...hint,
            id: createLocalId("illustration"),
            sourceMessageIds: hint.sourceMessageIds.flatMap((messageId) => {
              const copiedMessageId = messageIdMap.get(messageId);
              return copiedMessageId ? [copiedMessageId] : [];
            }),
            createdAt,
          })),
          assetDrafts: scene.assetDrafts.map((draft) => ({
            ...draft,
            id: createLocalId("draft"),
            sourceMessageIds: draft.sourceMessageIds.flatMap((messageId) => {
              const copiedMessageId = messageIdMap.get(messageId);
              return copiedMessageId ? [copiedMessageId] : [];
            }),
            timelineEvents: draft.timelineEvents.map((event) => ({
              ...event,
              id: createLocalId("timeline-draft"),
            })),
            characterMemories: draft.characterMemories.flatMap((memory) => {
              const copiedCharacterId = characterIdMap.get(memory.characterId);
              return copiedCharacterId
                ? [{
                    ...memory,
                    id: createLocalId("memory-draft"),
                    characterId: copiedCharacterId,
                  }]
                : [];
            }),
            lorebookEntries: draft.lorebookEntries.map((entry) => ({
              ...entry,
              id: createLocalId("lore-draft"),
              keywords: [...entry.keywords],
            })),
            createdAt,
            updatedAt: createdAt,
          })),
          characterIds,
          activeCharacterId: characterIdMap.get(scene.activeCharacterId) ?? characterIds[0] ?? "",
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernScene;
      });
      const copiedLorebookEntries = sourceRoom.lorebookEntries.map((entry) => ({
        ...entry,
        id: createLocalId("lore"),
        keywords: [...entry.keywords],
        createdAt,
        updatedAt: createdAt,
      }));
      const activeSceneId = sceneIdMap.get(sourceRoom.activeSceneId ?? "") ?? copiedScenes[0]?.id ?? "";
      const copiedRoom: TavernRoom = projectTavernSceneOntoRoom({
        ...sourceRoom,
        id: copiedRoomId,
        workspaceId: workspace.id,
        systemPresetId: undefined,
        systemPresetVersion: undefined,
        locked: false,
        title: `${sourceRoom.title}（副本）`,
        activeSceneId,
        scenes: copiedScenes,
        localCharacters: copiedCharacters,
        lorebookEntries: copiedLorebookEntries,
        timelineEvents: copiedTimelineEvents,
        createdAt,
        updatedAt: createdAt,
      });

      return {
        ...current,
        activeRoomId: copiedRoomId,
        rooms: [...current.rooms, copiedRoom],
        messagesByScene: {
          ...current.messagesByScene,
          ...copiedMessagesByScene,
        },
      };
    });
    reportError("");
    return true;
  }, [reportError, setState, state.rooms, workspace.id]);

  const restoreSystemPresetRoom = useCallback(async (roomId: string) => {
    const room = state.rooms.find((item) => item.id === roomId);
    const preset = getTavernSystemPreset(room?.systemPresetId);
    if (!room || room.locked || !preset) {
      return false;
    }

    try {
      await deleteTavernBridgeSession({ workspacePath: workspace.path, room });
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : String(resetError);
      reportError(`无法清理酒馆底层会话：${message}`);
      return false;
    }

    setState((current) => {
      const sourceRoom = current.rooms.find((item) => item.id === roomId);
      const sourcePreset = getTavernSystemPreset(sourceRoom?.systemPresetId);
      if (!sourceRoom || sourceRoom.locked || !sourcePreset) {
        return current;
      }

      const restored = createTavernRoomFromSystemPreset(workspace.id, sourcePreset.id, {
        roomId: sourceRoom.id,
        roomCreatedAt: sourceRoom.createdAt,
      });

      return {
        ...current,
        activeRoomId: sourceRoom.id,
        rooms: current.rooms.map((item) =>
          item.id === sourceRoom.id ? restored.room : item
        ),
        messagesByScene: {
          ...current.messagesByScene,
          [restored.room.activeSceneId ?? sourceRoom.id]: restored.messages,
        },
      };
    });
    reportError("");
    return true;
  }, [reportError, setState, state.rooms, workspace.id, workspace.path]);

  const setRoomLocked = useCallback((roomId: string, locked: boolean) => {
    const room = state.rooms.find((item) => item.id === roomId);
    if (!room || room.locked === locked) {
      return false;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((item) =>
        item.id === roomId
          ? {
              ...item,
              locked,
              updatedAt: Date.now(),
            }
          : item,
      ),
    }));
    reportError("");
    return true;
  }, [reportError, setState, state.rooms]);

  const exportRoom = useCallback((roomId: string) => {
    const targetRoom = state.rooms.find((room) => room.id === roomId);
    if (!targetRoom) {
      return false;
    }

    try {
      const projectedTargetRoom = projectTavernSceneOntoRoom(targetRoom);
      const targetCharacters = projectedTargetRoom.localCharacters ?? [];
      const targetMessages = getSceneMessages(projectedTargetRoom, state);
      const messagesByScene = Object.fromEntries(
        (projectedTargetRoom.scenes ?? []).map((scene) => [
          scene.id,
          state.messagesByScene[scene.id] ??
            (scene.id === projectedTargetRoom.activeSceneId ? targetMessages : []),
        ]),
      );
      const payload: TavernRoomExportV2 = {
        schema: TAVERN_ROOM_EXPORT_SCHEMA,
        version: 2,
        exportedAt: new Date().toISOString(),
        room: projectedTargetRoom,
        characters: targetCharacters,
        messages: targetMessages,
        messagesByScene,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeFileName(targetRoom.title)}.tavern-room.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }, [state]);

  const importRoom = useCallback((raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return "房间文件不是有效 JSON。";
    }

    const importExternalPayload = () => {
      try {
        return parseTavernExternalImportJson(raw);
      } catch (error) {
        return getErrorMessage(error);
      }
    };
    const parsedRoomExport = parsed as Partial<TavernRoomExportV2>;
    if (
      parsedRoomExport.schema !== TAVERN_ROOM_EXPORT_SCHEMA ||
      parsedRoomExport.version !== 2 ||
      !parsedRoomExport.room ||
      !Array.isArray(parsedRoomExport.characters)
    ) {
      const externalPayload = importExternalPayload();
      if (typeof externalPayload === "string") {
        return externalPayload;
      }

      if (
        externalPayload.kind === "generatedPreset" ||
        externalPayload.kind === "characterCard"
      ) {
        try {
          const materialized = createTavernRoomFromGeneratedPresetJson(
            workspace.id,
            externalPayload.preset,
            {
              creationSource: externalPayload.kind === "characterCard"
                ? "imported"
                : "agent_generated",
            },
          );
          setState((current) => ({
            ...current,
            activeRoomId: materialized.room.id,
            rooms: [...current.rooms, materialized.room],
            messagesByScene: {
              ...current.messagesByScene,
              [getRoomActiveSceneId(materialized.room)]: materialized.messages,
            },
          }));
          reportError("");
          return null;
        } catch (error) {
          return getErrorMessage(error);
        }
      }

      if (externalPayload.kind === "worldBook") {
        if (!activeRoom || activeRoom.locked) {
          return activeRoom?.locked ? "当前房间已锁定，不能导入世界书。" : "没有可导入世界书的当前房间。";
        }

        const lorebookEntries = externalPayload.entries.map((entry) => ({
          ...createTavernLorebookEntry({
            title: entry.title,
            content: entry.content,
            keywords: entry.keywords,
            alwaysOn: entry.alwaysOn,
          }),
          enabled: entry.enabled,
        }));
        const importMessage = createTavernMessage({
          roomId: activeRoom.id,
          role: "narrator",
          content: `已导入世界书「${externalPayload.label}」，新增 ${lorebookEntries.length} 条设定。`,
          status: "done",
        });
        setState((current) => {
          const targetRoom = current.rooms.find((room) => room.id === activeRoom.id);
          if (!targetRoom || targetRoom.locked) {
            return current;
          }

          const sceneId = getRoomActiveSceneId(targetRoom);
          const nextRoom = syncTavernRoomActiveScene({
            ...projectTavernSceneOntoRoom(targetRoom),
            lorebookEntries: [
              ...targetRoom.lorebookEntries,
              ...lorebookEntries,
            ],
            updatedAt: Date.now(),
          });
          return {
            ...current,
            rooms: current.rooms.map((room) =>
              room.id === targetRoom.id ? nextRoom : room
            ),
            messagesByScene: {
              ...current.messagesByScene,
              [sceneId]: [
                ...(current.messagesByScene[sceneId] ?? []),
                importMessage,
              ],
            },
          };
        });
        reportError("");
        return null;
      }

      return "导入文件格式不受支持。";
    }

    const parsedExport = parsed as TavernRoomExportV2;
    const createdAt = Date.now();
    const roomId = createLocalId("room");
    const characterIdMap = new Map<string, string>();
    const importedCharacters = parsedExport.characters
      .flatMap((character) => {
        const name = typeof character.name === "string" ? character.name.trim() : "";
        const description = typeof character.description === "string" ? character.description.trim() : "";
        const speakingStyle = typeof character.speakingStyle === "string" ? character.speakingStyle.trim() : "";
        if (!character.id || !name || !description || !speakingStyle) {
          return [];
        }

        const nextId = createLocalId("character");
        characterIdMap.set(character.id, nextId);
        return [{
          id: nextId,
          name,
          avatar: character.avatar || tavernAvatarOptions[0]?.id || "",
          description,
          speakingStyle,
          writingStyle: character.writingStyle?.trim() || undefined,
          replyStylePrompt: character.replyStylePrompt?.trim() || undefined,
          goals: character.goals?.trim() || undefined,
          relationships: character.relationships?.trim() || undefined,
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernCharacter];
      });

    if (importedCharacters.length === 0) {
      return "房间文件里没有可导入的角色。";
    }

    const importedCharacterIds = parsedExport.room.characterIds
      .flatMap((characterId) => {
        const mappedId = characterIdMap.get(characterId);
        return mappedId ? [mappedId] : [];
      });
    const characterIds = importedCharacterIds.length > 0
      ? importedCharacterIds
      : importedCharacters.map((character) => character.id);
    const activeCharacterId = characterIdMap.get(parsedExport.room.activeCharacterId) ?? characterIds[0] ?? "";
    const characterMemories = Object.fromEntries(
      Object.entries(parsedExport.room.characterMemories ?? {})
        .flatMap(([characterId, memory]) => {
          const mappedId = characterIdMap.get(characterId);
          return mappedId && typeof memory === "string" && memory.trim()
            ? [[mappedId, memory.trim()]]
            : [];
        }),
    );
    const characterConfigs = Object.fromEntries(
      parsedExport.room.characterIds.flatMap((sourceCharacterId) => {
        const mappedId = characterIdMap.get(sourceCharacterId);
        if (!mappedId) {
          return [];
        }
        return [[
          mappedId,
          {
            characterId: mappedId,
            memory: characterMemories[mappedId],
          },
        ]];
      }),
    );
    const importedTimelineEvents = (parsedExport.room.timelineEvents ?? [])
      .flatMap((event) => (
        event.title?.trim() && event.summary?.trim()
          ? [createTavernTimelineEvent({
              title: event.title,
              summary: event.summary,
            })]
          : []
      ));
    const importedLorebookEntries = (parsedExport.room.lorebookEntries ?? [])
      .flatMap((entry) => (
        entry.title?.trim() && entry.content?.trim()
          ? [createTavernLorebookEntry({
              title: entry.title,
              content: entry.content,
              keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
              alwaysOn: Boolean(entry.alwaysOn),
            })]
          : []
      ));
    const importedAssetDrafts = (parsedExport.room.assetDrafts ?? [])
      .flatMap((draft) => {
        const assetDraft = createTavernAssetDraft({
          sourceMessageIds: [],
          timelineEvents: draft.timelineEvents,
          characterMemories: draft.characterMemories.flatMap((memory) => {
            const mappedId = characterIdMap.get(memory.characterId);
            return mappedId
              ? [{
                  characterId: mappedId,
                  note: memory.note,
                }]
              : [];
          }),
          lorebookEntries: draft.lorebookEntries,
        });
        return hasAssetDraftItems(assetDraft) ? [assetDraft] : [];
      });
    const importedIllustrationHints = (parsedExport.room.illustrationHints ?? [])
      .flatMap((hint) => hint.prompt?.trim()
        ? [createTavernIllustrationHint({
            prompt: hint.prompt,
            turnId: hint.turnId,
            sourceMessageIds: [],
          })]
        : []);
    const title = parsedExport.room.title?.trim() || "导入酒馆";
    const importedScene = createTavernScene({
      title: parsedExport.room.scenes?.find((scene) => scene.id === parsedExport.room.activeSceneId)?.title ?? "默认场景",
      order: 0,
      scenePresetId: normalizeVisualPresetId(parsedExport.room.scenePresetId),
      scene: parsedExport.room.scene?.trim() || "一间刚被导入的酒馆房间。",
      sceneGoal: parsedExport.room.sceneGoal?.trim() || "",
      plot: parsedExport.room.scenePlot?.trim() || "",
      storyDirection: parsedExport.room.sceneDirection?.trim() || "",
      transition: parsedExport.room.sceneTransition?.trim() || "",
      memory: parsedExport.room.memory?.trim() || "",
      characterConfigs,
      characterMemories,
      illustrationHints: importedIllustrationHints,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
    const importedRoom: TavernRoom = projectTavernSceneOntoRoom({
      id: roomId,
      workspaceId: workspace.id,
      title: `${title}（导入）`,
      promptStyleId: normalizeTavernPromptStyleId(parsedExport.room.promptStyleId),
      creationSource: "imported",
      storyOutline: parsedExport.room.storyOutline?.trim() || "",
      storyGoal: parsedExport.room.storyGoal?.trim() || "",
      activeSceneId: importedScene.id,
      scenes: [importedScene],
      scenePresetId: importedScene.scenePresetId,
      scene: importedScene.scene,
      sceneGoal: importedScene.sceneGoal,
      scenePlot: importedScene.plot,
      sceneDirection: importedScene.storyDirection,
      sceneTransition: importedScene.transition,
      locked: false,
      memory: importedScene.memory,
      sceneStatus: importedScene.sceneStatus,
      characterPublicStatuses: importedScene.characterPublicStatuses,
      characterPrivateStatuses: importedScene.characterPrivateStatuses,
      pendingInteractions: importedScene.pendingInteractions,
      replyOptions: importedScene.replyOptions,
      statusDefinitions: Array.isArray(parsedExport.room.statusDefinitions)
        ? parsedExport.room.statusDefinitions
        : [...DEFAULT_TAVERN_STATUS_DEFINITIONS],
      statusRules: Array.isArray(parsedExport.room.statusRules)
        ? parsedExport.room.statusRules
        : [...DEFAULT_TAVERN_STATUS_RULES],
      progressViews: Array.isArray(parsedExport.room.progressViews)
        ? parsedExport.room.progressViews
        : [...DEFAULT_TAVERN_PROGRESS_VIEWS],
      progressTracker: parsedExport.room.progressTracker ?? { ...DEFAULT_TAVERN_PROGRESS_TRACKER },
      factEvents: remapImportedFactEvents(parsedExport.room.factEvents, characterIdMap),
      statusEvents: remapImportedStatusEvents(parsedExport.room.statusEvents, characterIdMap),
      statusSnapshot: importedScene.statusSnapshot,
      previousStatusSnapshot: importedScene.previousStatusSnapshot,
      statusCheckpoints: importedScene.statusCheckpoints,
      taskDefinitions: remapImportedTaskDefinitions(parsedExport.room.taskDefinitions, characterIdMap),
      taskEvents: remapImportedTaskEvents(parsedExport.room.taskEvents, characterIdMap),
      taskSnapshot: remapImportedTaskSnapshot(parsedExport.room.taskSnapshot, characterIdMap),
      sceneOutcomes: remapImportedSceneOutcomes(parsedExport.room.sceneOutcomes, characterIdMap),
      outcomeEvents: remapImportedOutcomeEvents(parsedExport.room.outcomeEvents, characterIdMap),
      characterConfigs,
      characterMemories,
      localCharacters: importedCharacters,
      lorebookEntries: importedLorebookEntries,
      timelineEvents: importedTimelineEvents,
      illustrationHints: importedScene.illustrationHints,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      replyMode: parsedExport.room.replyMode === "round" || parsedExport.room.replyMode === "director"
        ? parsedExport.room.replyMode
        : "active",
      userPersonaName: parsedExport.room.userPersonaName?.trim() || "我",
      settings: normalizeImportedRoomSettings(parsedExport.room.settings),
      createdAt,
      updatedAt: createdAt,
    });
    const importedMessages = Array.isArray(parsedExport.messages)
      ? parsedExport.messages.flatMap((message) => {
          if (!message.content?.trim()) {
            return [];
          }

          if (message.role === "character") {
            const mappedCharacterId = message.characterId
              ? characterIdMap.get(message.characterId)
              : undefined;
            if (!mappedCharacterId) {
              return [];
            }

            return [createTavernMessage({
              roomId,
              role: "character",
              characterId: mappedCharacterId,
              content: message.content,
              status: "done",
              referencedFiles: message.referencedFiles,
            })];
          }

          return [createTavernMessage({
            roomId,
            role: message.role === "user" ? "user" : "narrator",
            content: message.content,
            status: "done",
            referencedFiles: message.referencedFiles,
          })];
        })
      : [];
    const messages = importedMessages.length > 0
      ? importedMessages
      : [
          createTavernMessage({
            roomId,
            role: "narrator",
            content: "这个房间从外部文件导入，灯光重新亮起。",
            status: "done",
          }),
        ];

    setState((current) => ({
      ...current,
      activeRoomId: roomId,
      rooms: [...current.rooms, importedRoom],
      messagesByScene: {
        ...current.messagesByScene,
        [importedScene.id]: messages,
      },
    }));
    reportError("");
    return null;
  }, [activeRoom, reportError, setState, workspace.id]);

  const createRoom = useCallback(() => {
    const nextRoom = {
      ...createTavernRoom(workspace.id, state.rooms.length + 1),
    };
    const openingMessage = createTavernMessage({
      roomId: nextRoom.id,
      role: "narrator",
      content: "新的桌边留出空位，灯光落在还没有写下的第一行。",
      status: "done",
    });

    setState((current) => ({
      ...current,
      activeRoomId: nextRoom.id,
      rooms: [...current.rooms, nextRoom],
      messagesByScene: {
        ...current.messagesByScene,
        [getRoomActiveSceneId(nextRoom)]: [openingMessage],
      },
    }));
    return nextRoom.id;
  }, [setState, state.rooms.length, workspace.id]);

  const quickCreateRoom = useCallback(async (
    quickDraft: TavernGeneratedPresetAgentDraft,
  ) => {
    if (!runtimeModel) {
      return TAVERN_RUNTIME_MODEL_UNAVAILABLE;
    }

    if (!runtimeAgentId) {
      return "当前 Agent 运行时不可用，请稍后重试。";
    }

    try {
      const result = await runTavernGeneratedPresetAgent({
        workspacePath: workspace.path,
        agentId: runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        draft: quickDraft,
      });
      const materialized = createTavernRoomFromGeneratedPresetJson(
        workspace.id,
        result.preset,
        {
          creationSource: "quick",
        },
      );
      setState((current) => ({
        ...current,
        activeRoomId: materialized.room.id,
        rooms: [...current.rooms, materialized.room],
        messagesByScene: {
          ...current.messagesByScene,
          [getRoomActiveSceneId(materialized.room)]: materialized.messages,
        },
      }));
      reportError("");
      return null;
    } catch (quickCreateError) {
      return getErrorMessage(quickCreateError);
    }
  }, [reportError, runtimeAgentId, runtimeModel, setState, workspace.id, workspace.path]);

  const selectRoom = useCallback((roomId: string) => {
    setState((current) => ({
      ...current,
      activeRoomId: roomId,
    }));
  }, [setState]);

  const runTextFieldAgent = useCallback(async (
    request: TavernTextFieldAgentRequest,
  ) => {
    if (!runtimeModel) {
      throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
    }

    if (!runtimeAgentId) {
      throw new Error("当前 Agent 运行时不可用，请稍后重试。");
    }

    return runTavernTextFieldAgent({
      ...request,
      workspacePath: workspace.path,
      agentId: runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
    });
  }, [runtimeAgentId, runtimeModel, workspace.path]);

  const regenerateDirectorProfile = useCallback(async (
    room: TavernRoom,
  ) => {
    if (!runtimeModel) {
      throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
    }

    if (!runtimeAgentId) {
      throw new Error("当前 Agent 运行时不可用，请稍后重试。");
    }

    const roomCharacterById = new Map(
      (room.localCharacters ?? []).map((character) => [character.id, character] as const),
    );
    const characters = room.characterIds
      .map((characterId) => roomCharacterById.get(characterId) ?? characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
    if (characters.length === 0) {
      throw new Error("当前酒馆还没有可生成调度画像的角色。");
    }

    return runTavernDirectorProfileAgent({
      workspacePath: workspace.path,
      agentId: runtimeAgentId,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room,
      characters,
    });
  }, [characterById, runtimeAgentId, runtimeModel, workspace.path]);

  const value = useMemo<ManagementContextValue | null>(() => activeRoom
    ? {
        rooms: state.rooms,
        activeRoom,
        characterById,
        messagesByRoomId,
        createRoom,
        quickCreateRoom,
        selectRoom,
        patchRoom,
        copyRoom,
        restoreSystemPresetRoom,
        setRoomLocked,
        deleteRoom,
        clearRoomMessages,
        exportRoom,
        importRoom,
        globalRuntimeModel: runtimeModel,
        runTextFieldAgent,
        regenerateDirectorProfile,
      }
    : null, [
    activeRoom,
    characterById,
    clearRoomMessages,
    copyRoom,
    createRoom,
    deleteRoom,
    exportRoom,
    importRoom,
    messagesByRoomId,
    patchRoom,
    quickCreateRoom,
    regenerateDirectorProfile,
    restoreSystemPresetRoom,
    runTextFieldAgent,
    runtimeModel,
    selectRoom,
    setRoomLocked,
    state.rooms,
  ]);

  if (!value) {
    return null;
  }

  return (
    <ManagementContextProvider value={value}>
      {children}
    </ManagementContextProvider>
  );
};
