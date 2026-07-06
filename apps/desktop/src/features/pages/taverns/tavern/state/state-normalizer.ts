import { projectTavernSceneOntoRoom } from "../runtime/active-scene-runtime";
import { normalizeLorebookEntry } from "../normalizers/asset-normalizers";
import { projectTavernSceneFieldsOntoRoom } from "../runtime/scene-field-projection";
import { normalizeTavernCharacter } from "../normalizers/character-normalizers";
import { materializeTavernMessage } from "../message";
import { createDefaultPromptForPresentation, normalizeRoomPresentation } from "../presentation/presentation-settings";
import { normalizeTavernPromptSettings } from "../prompt-registry/text-blocks";
import { normalizeReplyMode } from "../normalizers/reply-mode";
import { normalizeRoomSettings } from "../normalizers/room-settings";
import { buildTavernScene } from "../story-model/scene-builder";
import { normalizeStoryGraph } from "../story-model/story-graph";
import { normalizeTavernStoryBinding } from "../story-model/story-binding";
import { getTavernSystemPreset, normalizeSystemPresetId, tavernSystemPresets } from "../system-preset-registry";
import { createTavernRoomFromSystemPreset } from "../factories/system-preset-room";
import {
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeStatusDefinitions,
  normalizeStatusRules,
} from "../normalizers/status-normalizers";
import type {
  TavernMessage,
  TavernState,
  TavernWorkflowTraceEvent,
  TavernWorkflowTraceRun,
  TavernWorkflowTraceStep,
} from "../types";
import type { TavernCharacter, TavernLorebookEntry, TavernRoom } from "@/features/pages/taverns/manage/model";

type MaterializedDefaultTavernRoom = ReturnType<typeof createTavernRoomFromSystemPreset> & {
  sceneInstanceId: string;
};

const TAVERN_WORKFLOW_TRACE_RUN_LIMIT = 20;
const TAVERN_WORKFLOW_TRACE_EVENT_LIMIT = 200;

const defaultRoomIdForSystemPreset = (presetId: string) => `default-room-${presetId}`;

const materializeDefaultTavernSystemPresetRooms = ({
  workspaceId,
  existingRoomIds = new Set<string>(),
  existingSystemPresetIds = new Set<string>(),
}: {
  workspaceId: string;
  existingRoomIds?: Set<string>;
  existingSystemPresetIds?: Set<string>;
}): MaterializedDefaultTavernRoom[] =>
  tavernSystemPresets.flatMap((preset, index) => {
    if (existingSystemPresetIds.has(preset.id)) {
      return [];
    }

    const defaultRoomId = defaultRoomIdForSystemPreset(preset.id);
    const materialized = createTavernRoomFromSystemPreset(workspaceId, preset.id, {
      roomId: existingRoomIds.has(defaultRoomId) ? undefined : defaultRoomId,
      createdAt: Date.now() + index,
    });
    const sceneInstanceId =
      materialized.room.activeSceneInstanceId ??
      materialized.room.sceneInstances[0]?.id ??
      materialized.room.activeSceneId;

    return [
      {
        ...materialized,
        sceneInstanceId,
        messages: materialized.messages.map((message) => ({
          ...message,
          roomId: materialized.room.id,
          sceneId: message.sceneId ?? materialized.room.activeSceneId,
          sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
        })),
      },
    ];
  });

const messagesByInstanceFromMaterializedDefaults = (rooms: MaterializedDefaultTavernRoom[]) =>
  Object.fromEntries(rooms.map((item) => [item.sceneInstanceId, item.messages]));

const ensureDefaultTavernSystemPresetRooms = (workspaceId: string, state: TavernState): TavernState => {
  const materializedDefaults = materializeDefaultTavernSystemPresetRooms({
    workspaceId,
    existingRoomIds: new Set(state.rooms.map((room) => room.id)),
    existingSystemPresetIds: new Set(state.rooms.flatMap((room) => (room.systemPresetId ? [room.systemPresetId] : []))),
  });
  if (materializedDefaults.length === 0) {
    return state;
  }

  const rooms = [...state.rooms, ...materializedDefaults.map((item) => item.room)];
  return {
    ...state,
    activeRoomId: rooms.some((room) => room.id === state.activeRoomId) ? state.activeRoomId : (rooms[0]?.id ?? ""),
    rooms,
    messagesByInstance: {
      ...state.messagesByInstance,
      ...messagesByInstanceFromMaterializedDefaults(materializedDefaults),
    },
    workflowTracesByInstance: {
      ...state.workflowTracesByInstance,
      ...Object.fromEntries(materializedDefaults.map((item) => [item.sceneInstanceId, []])),
    },
  };
};

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const materializedRooms = materializeDefaultTavernSystemPresetRooms({
    workspaceId,
  });

  return {
    version: 4,
    activeRoomId: materializedRooms[0]?.room.id ?? "",
    rooms: materializedRooms.map((item) => item.room),
    messagesByInstance: messagesByInstanceFromMaterializedDefaults(materializedRooms),
    workflowTracesByInstance: Object.fromEntries(materializedRooms.map((item) => [item.sceneInstanceId, []])),
  };
};

const normalizeWorkflowTraceStepStatus = (value: unknown): TavernWorkflowTraceStep["status"] =>
  value === "pending" || value === "running" || value === "done" || value === "skipped" || value === "error"
    ? value
    : "pending";

const normalizeWorkflowTraceStepType = (value: unknown): TavernWorkflowTraceStep["stepType"] =>
  value === "agent" || value === "transform" || value === "condition" || value === "router" ? value : undefined;

const normalizeWorkflowTraceStep = (value: unknown): TavernWorkflowTraceStep | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernWorkflowTraceStep>;
  if (!candidate.id || !candidate.label) {
    return null;
  }

  return {
    id: candidate.id,
    label: candidate.label,
    status: normalizeWorkflowTraceStepStatus(candidate.status),
    detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
    stepType: normalizeWorkflowTraceStepType(candidate.stepType),
    agentRoleId: typeof candidate.agentRoleId === "string" ? candidate.agentRoleId : undefined,
    agentTaskId: typeof candidate.agentTaskId === "string" ? candidate.agentTaskId : undefined,
    outputKey: typeof candidate.outputKey === "string" ? candidate.outputKey : undefined,
    route: typeof candidate.route === "string" || candidate.route === null ? candidate.route : undefined,
  };
};

const normalizeWorkflowTraceEvent = (value: unknown): TavernWorkflowTraceEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernWorkflowTraceEvent>;
  if (!candidate.id || !candidate.type || !candidate.workflowRunId) {
    return null;
  }

  return {
    id: candidate.id,
    at: typeof candidate.at === "number" ? candidate.at : Date.now(),
    type: candidate.type,
    workflowRunId: candidate.workflowRunId,
    workflowId: typeof candidate.workflowId === "string" ? candidate.workflowId : undefined,
    runtimeId: typeof candidate.runtimeId === "string" ? candidate.runtimeId : undefined,
    stepId: typeof candidate.stepId === "string" ? candidate.stepId : undefined,
    stepType: normalizeWorkflowTraceStepType(candidate.stepType),
    agentRoleId: typeof candidate.agentRoleId === "string" ? candidate.agentRoleId : undefined,
    agentTaskId: typeof candidate.agentTaskId === "string" ? candidate.agentTaskId : undefined,
    detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
    payload: candidate.payload,
  };
};

const normalizeWorkflowTraceRunStatus = (value: unknown): TavernWorkflowTraceRun["status"] =>
  value === "running" || value === "done" || value === "error" ? value : "running";

const normalizeWorkflowTraceRun = (value: unknown): TavernWorkflowTraceRun | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernWorkflowTraceRun>;
  if (!candidate.id || !candidate.workflowRunId || !candidate.workflowId) {
    return null;
  }

  return {
    id: candidate.id,
    workflowRunId: candidate.workflowRunId,
    workflowId: candidate.workflowId,
    runtimeId: typeof candidate.runtimeId === "string" ? candidate.runtimeId : undefined,
    taskId: typeof candidate.taskId === "string" ? candidate.taskId : undefined,
    anchorMessageId: typeof candidate.anchorMessageId === "string" ? candidate.anchorMessageId : undefined,
    scopeLabel: typeof candidate.scopeLabel === "string" ? candidate.scopeLabel : undefined,
    status: normalizeWorkflowTraceRunStatus(candidate.status),
    startedAt: typeof candidate.startedAt === "number" ? candidate.startedAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
    steps: Array.isArray(candidate.steps)
      ? candidate.steps.map(normalizeWorkflowTraceStep).filter((step): step is TavernWorkflowTraceStep => Boolean(step))
      : [],
    events: Array.isArray(candidate.events)
      ? candidate.events
          .map(normalizeWorkflowTraceEvent)
          .filter((event): event is TavernWorkflowTraceEvent => Boolean(event))
          .slice(-TAVERN_WORKFLOW_TRACE_EVENT_LIMIT)
      : [],
    result: candidate.result && typeof candidate.result === "object" ? candidate.result : undefined,
  };
};

export const normalizeTavernState = (
  workspaceId: string,
  value: unknown,
  options: {
    includeDefaultRooms?: boolean;
  } = {},
): TavernState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernState>;
  if (
    candidate.version !== 4 ||
    !Array.isArray(candidate.rooms) ||
    !candidate.messagesByInstance ||
    typeof candidate.messagesByInstance !== "object"
  ) {
    return null;
  }

  const sourceMessagesByInstance = candidate.messagesByInstance as Record<string, unknown>;
  const sourceWorkflowTracesByInstance =
    candidate.workflowTracesByInstance && typeof candidate.workflowTracesByInstance === "object"
      ? (candidate.workflowTracesByInstance as Record<string, unknown>)
      : {};
  const rooms = candidate.rooms
    .filter((room): room is TavernRoom =>
      Boolean(
        room?.id &&
        room.workspaceId === workspaceId &&
        room.title &&
        room.storyGraph &&
        Array.isArray(room.storyGraph.nodes) &&
        Array.isArray(room.storyGraph.edges) &&
        Array.isArray(room.scenes) &&
        room.scenes.length > 0 &&
        Array.isArray(room.sceneInstances),
      ),
    )
    .map((room) => {
      const sourceRoom = room as Partial<TavernRoom>;
      const normalizedAt = Date.now();
      const systemPresetId = normalizeSystemPresetId(sourceRoom.systemPresetId);
      const systemPreset = getTavernSystemPreset(systemPresetId);
      const localCharacters = Array.isArray(sourceRoom.localCharacters)
        ? (sourceRoom.localCharacters ?? [])
            .filter((character): character is TavernCharacter => Boolean(character?.id && character.name))
            .map((character) => normalizeTavernCharacter(character))
        : [];
      const presentation = normalizeRoomPresentation({
        presentation: sourceRoom.presentation,
      });
      const scenes = (sourceRoom.scenes ?? [])
        .map((scene) => buildTavernScene(scene))
        .sort((left, right) => left.order - right.order)
        .map((scene, index) => ({ ...scene, order: index }));
      const activeSceneId = scenes.some((scene) => scene.id === sourceRoom.activeSceneId)
        ? sourceRoom.activeSceneId
        : scenes[0].id;
      const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
      const createdAt = typeof sourceRoom.createdAt === "number" ? sourceRoom.createdAt : normalizedAt;
      const roomIdentity = {
        id: room.id,
        workspaceId: room.workspaceId,
        title: room.title,
        systemPresetId: systemPreset?.id,
        systemPresetVersion: systemPreset
          ? typeof sourceRoom.systemPresetVersion === "number"
            ? sourceRoom.systemPresetVersion
            : systemPreset.version
          : undefined,
        locked: Boolean(sourceRoom.locked),
        creationSource:
          sourceRoom.creationSource === "quick" ||
          sourceRoom.creationSource === "imported" ||
          sourceRoom.creationSource === "agent_generated"
            ? sourceRoom.creationSource
            : ("manual" as const),
        createdAt,
        updatedAt: typeof sourceRoom.updatedAt === "number" ? sourceRoom.updatedAt : normalizedAt,
      };
      const roomPrompt = {
        presentation,
        prompt: normalizeTavernPromptSettings(sourceRoom.prompt, createDefaultPromptForPresentation(presentation)),
      };
      const roomStory = {
        storyBinding: normalizeTavernStoryBinding(sourceRoom.storyBinding, room.id, createdAt),
        storyOutline: typeof sourceRoom.storyOutline === "string" ? (sourceRoom.storyOutline ?? "") : "",
        storyGoal: typeof sourceRoom.storyGoal === "string" ? (sourceRoom.storyGoal ?? "") : "",
        storyGraph: normalizeStoryGraph(sourceRoom.storyGraph, scenes),
        storyRuns: Array.isArray(sourceRoom.storyRuns) ? (sourceRoom.storyRuns ?? []) : [],
        activeRunId: typeof sourceRoom.activeRunId === "string" ? sourceRoom.activeRunId : undefined,
        activeSceneInstanceId:
          typeof sourceRoom.activeSceneInstanceId === "string" ? sourceRoom.activeSceneInstanceId : undefined,
        sceneInstances: Array.isArray(sourceRoom.sceneInstances) ? (sourceRoom.sceneInstances ?? []) : [],
        activeSceneId,
        scenes,
      };
      const roomProgress = {
        statusDefinitions: normalizeStatusDefinitions(sourceRoom.statusDefinitions),
        statusRules: normalizeStatusRules(sourceRoom.statusRules),
        progressViews: normalizeProgressViews(sourceRoom.progressViews),
        progressTracker: normalizeProgressTracker(sourceRoom.progressTracker),
      };
      const roomAssets = {
        lorebookEntries: Array.isArray(sourceRoom.lorebookEntries)
          ? (sourceRoom.lorebookEntries ?? [])
              .map(normalizeLorebookEntry)
              .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
          : [],
        localCharacters,
      };
      const roomRuntimeSettings = {
        replyMode: normalizeReplyMode(sourceRoom.replyMode),
        userPersonaName: room.userPersonaName || "我",
        settings: normalizeRoomSettings(sourceRoom.settings),
      };
      const normalizedRoom: TavernRoom = {
        ...roomIdentity,
        ...roomPrompt,
        ...roomStory,
        ...projectTavernSceneFieldsOntoRoom(activeScene),
        ...roomProgress,
        ...roomAssets,
        ...roomRuntimeSettings,
      };

      return projectTavernSceneOntoRoom(normalizedRoom);
    });
  if (rooms.length === 0) {
    return options.includeDefaultRooms === false ? null : createDefaultTavernState(workspaceId);
  }
  const normalizedRooms = rooms;
  const messagesByInstance = Object.fromEntries(
    normalizedRooms.flatMap((room) =>
      room.sceneInstances.map((instance) => {
        const instanceMessages = Array.isArray(sourceMessagesByInstance[instance.id])
          ? (sourceMessagesByInstance[instance.id] as TavernMessage[])
          : [];

        return [
          instance.id,
          instanceMessages
            .filter((message): message is TavernMessage =>
              Boolean(message?.id && message.roomId && message.role && typeof message.content === "string"),
            )
            .map((message) =>
              materializeTavernMessage(
                {
                  ...message,
                  sceneId: message.sceneId ?? instance.sceneId,
                  sceneInstanceId: message.sceneInstanceId ?? instance.id,
                },
                room.presentation.profileId,
              ),
            ),
        ] as const;
      }),
    ),
  );
  const workflowTracesByInstance = Object.fromEntries(
    normalizedRooms.flatMap((room) =>
      room.sceneInstances.map((instance) => {
        const traces = Array.isArray(sourceWorkflowTracesByInstance[instance.id])
          ? (sourceWorkflowTracesByInstance[instance.id] as unknown[])
          : [];

        return [
          instance.id,
          traces
            .map(normalizeWorkflowTraceRun)
            .filter((trace): trace is TavernWorkflowTraceRun => Boolean(trace))
            .sort((left, right) => left.startedAt - right.startedAt)
            .slice(-TAVERN_WORKFLOW_TRACE_RUN_LIMIT),
        ] as const;
      }),
    ),
  );

  const activeRoomId = normalizedRooms.some((room) => room.id === candidate.activeRoomId)
    ? (candidate.activeRoomId ?? rooms[0].id)
    : normalizedRooms[0].id;

  const normalizedState: TavernState = {
    version: 4,
    activeRoomId,
    rooms: normalizedRooms,
    messagesByInstance,
    workflowTracesByInstance,
  };

  return options.includeDefaultRooms === false
    ? normalizedState
    : ensureDefaultTavernSystemPresetRooms(workspaceId, normalizedState);
};
