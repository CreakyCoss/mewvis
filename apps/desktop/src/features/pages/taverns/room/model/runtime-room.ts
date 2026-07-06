import type { TavernRoom as TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import type { TavernState } from "@/features/pages/taverns/tavern/types";
import { projectTavernSceneOntoRoom } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { projectTavernSceneFieldsOntoRoom } from "@/features/pages/taverns/tavern/runtime/scene-field-projection";
import { buildTavernScene, defaultSceneTitle } from "@/features/pages/taverns/tavern/story-model/scene-builder";
import { createDefaultStoryGraph } from "@/features/pages/taverns/tavern/story-model/story-graph";
import type { TavernRuntimeRoom } from ".";

export const pickTavernRoomConfig = (room: TavernRoomConfig): TavernRoomConfig => ({
  id: room.id,
  workspaceId: room.workspaceId,
  systemPresetId: room.systemPresetId,
  systemPresetVersion: room.systemPresetVersion,
  locked: room.locked,
  title: room.title,
  presentation: { ...room.presentation },
  prompt: {
    version: 1,
    blocks: room.prompt.blocks.map((block) => ({
      ...block,
      source: block.source ? { ...block.source } : undefined,
    })),
  },
  creationSource: room.creationSource,
  scenePresetId: room.scenePresetId,
  statusDefinitions: room.statusDefinitions.map((definition) => ({ ...definition })),
  statusRules: room.statusRules.map((rule) => ({ ...rule })),
  progressViews: room.progressViews.map((view) => ({
    ...view,
    items: view.items.map((item) => ({ ...item })),
  })),
  progressTracker: { ...room.progressTracker },
  taskDefinitions: room.taskDefinitions.map((task) => ({ ...task })),
  sceneOutcomes: room.sceneOutcomes.map((outcome) => ({ ...outcome })),
  replyMode: room.replyMode,
  settings: {
    ...room.settings,
    interactionQualityRuleIds: [...room.settings.interactionQualityRuleIds],
    directorNarrativeControl: { ...room.settings.directorNarrativeControl },
    directorLoop: { ...room.settings.directorLoop },
    continuation: { ...room.settings.continuation },
    replyOptions: { ...room.settings.replyOptions },
    statusTracking: { ...room.settings.statusTracking },
    randomEvents: { ...room.settings.randomEvents },
    illustrationHints: { ...room.settings.illustrationHints },
    directorScheduling: {
      ...room.settings.directorScheduling,
      directorOnlyPhaseValues: [...room.settings.directorScheduling.directorOnlyPhaseValues],
      speakerMotivation: {
        ...room.settings.directorScheduling.speakerMotivation,
        rules: room.settings.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
      },
      fixedOrder: {
        ...room.settings.directorScheduling.fixedOrder,
        phaseValues: [...room.settings.directorScheduling.fixedOrder.phaseValues],
      },
    },
    informationPolicy: {
      ...room.settings.informationPolicy,
      hiddenFacts: { ...room.settings.informationPolicy.hiddenFacts },
      roleAssignment: {
        ...room.settings.informationPolicy.roleAssignment,
        opening: {
          ...room.settings.informationPolicy.roleAssignment.opening,
          globalStatusPatches: room.settings.informationPolicy.roleAssignment.opening.globalStatusPatches.map(
            (patch) => ({
              ...patch,
            }),
          ),
        },
        rolePool: room.settings.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
      },
    },
  },
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

export const createTavernRuntimeRoomFromConfig = (room: TavernRoomConfig): TavernRuntimeRoom => {
  const createdAt = typeof room.createdAt === "number" ? room.createdAt : Date.now();
  const updatedAt = typeof room.updatedAt === "number" ? room.updatedAt : createdAt;
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: room.scenePresetId,
    taskDefinitions: room.taskDefinitions,
    sceneOutcomes: room.sceneOutcomes,
    createdAt,
    updatedAt,
  });

  return projectTavernSceneOntoRoom({
    ...room,
    storyOutline: "",
    storyGoal: "",
    storyGraph: createDefaultStoryGraph([scene]),
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes: [scene],
    ...projectTavernSceneFieldsOntoRoom(scene),
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    characterIds: [],
    activeCharacterId: "",
    userPersonaName: "我",
    createdAt,
    updatedAt,
  });
};

const activeSceneInstanceIdFor = (room: TavernRuntimeRoom) =>
  room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? room.activeSceneId ?? room.id;

export const createTavernRoomRuntimeStateFromConfigState = (state: TavernState, activeRoom: TavernRoomConfig) => {
  const rooms = state.rooms.map((room) =>
    createTavernRuntimeRoomFromConfig(room.id === activeRoom.id ? activeRoom : room),
  );
  const runtimeActiveRoom =
    rooms.find((room) => room.id === activeRoom.id) ?? createTavernRuntimeRoomFromConfig(activeRoom);
  const activeSceneInstanceId = activeSceneInstanceIdFor(runtimeActiveRoom);

  return {
    version: 4 as const,
    activeRoomId: runtimeActiveRoom.id,
    rooms: rooms.some((room) => room.id === runtimeActiveRoom.id) ? rooms : [...rooms, runtimeActiveRoom],
    messagesByInstance: {
      [activeSceneInstanceId]: [],
    },
    workflowTracesByInstance: {
      [activeSceneInstanceId]: [],
    },
  };
};
