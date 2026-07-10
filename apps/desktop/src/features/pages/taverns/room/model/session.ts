import { uniq } from "lodash-es";
import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import {
  createTavernAgentOutputFieldMessageBody,
  createTavernTextMessageBody,
} from "@/features/pages/taverns/room/model/message-body";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernRoom as TavernRoomConfig,
  TavernRoomPromptSettings,
  TavernRoomSettings,
  TavernScenePromptOverrides,
} from "@/features/pages/taverns/manage/model";
import type { TavernRoomOpeningInput } from "./opening-input";
import type {
  TavernCharacterMemoryLayers,
  TavernRoomRuntime,
  TavernRoomSessionState,
  TavernScene,
  TavernSceneMemoryLayers,
  TavernStoryBinding,
  TavernStoryGraph,
  TavernStoryNode,
} from "./standard";

const defaultSceneTitle = "默认场景";

const trimText = (value?: string | null) => value?.trim() ?? "";

const pickText = (value: string | null | undefined, defaultValue = "") => trimText(value) || defaultValue;

const numberOrDefault = (value: number | undefined, defaultValue: number) => value ?? defaultValue;

const unique = (items: string[]) => uniq(items);

const mergeRoomSettings = (base: TavernRoomSettings, override?: Partial<TavernRoomSettings>): TavernRoomSettings => ({
  ...base,
  ...override,
  directorLoop: {
    ...base.directorLoop,
    ...override?.directorLoop,
  },
  directorNarrativeControl: {
    ...base.directorNarrativeControl,
    ...override?.directorNarrativeControl,
  },
});

const mergePromptSettings = (
  base: TavernRoomPromptSettings,
  override?: Partial<TavernRoomPromptSettings>,
): TavernRoomPromptSettings => ({
  ...base,
  ...override,
  blocks: override?.blocks ?? base.blocks,
});

const pickActiveCharacterId = (inputCharacterId: string | undefined, characterIds: string[]) =>
  inputCharacterId ?? characterIds[0] ?? "";

const createDefaultStoryGraph = (title = "当前节点", timestamp = getCurrentTimestamp()): TavernStoryGraph => {
  const entryNode: TavernStoryNode = {
    id: createTimestampId("node"),
    title,
    type: "normal",
    pathRole: "main",
    position: { x: 120, y: 120 },
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    version: 1,
    entryNodeId: entryNode.id,
    activeNodeId: entryNode.id,
    nodes: [entryNode],
    edges: [],
  };
};

const createScenePromptOverrides = (input: Partial<TavernScenePromptOverrides> = {}): TavernScenePromptOverrides => ({
  version: 1,
  blocks: input.blocks ?? [],
});

const createSceneMemoryLayers = (input: Partial<TavernSceneMemoryLayers> = {}): TavernSceneMemoryLayers => ({
  required: input.required?.trim() ?? "",
  private: input.private?.trim() ?? "",
  public: input.public?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  updatedAt: input.updatedAt,
});

const createCharacterMemoryLayers = (
  input: Partial<TavernCharacterMemoryLayers> = {},
): TavernCharacterMemoryLayers => ({
  required: input.required?.trim() ?? "",
  public: input.public?.trim() ?? "",
  known: input.known?.trim() ?? "",
  privateSelf: input.privateSelf?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  updatedAt: input.updatedAt,
});

const createScene = (
  input: TavernRoomOpeningInput["scene"] = {},
  {
    characterIds,
    activeCharacterId,
    characterMemoryLayers,
    scenePresetId,
    createdAt,
  }: {
    characterIds: string[];
    activeCharacterId: string;
    characterMemoryLayers: Record<string, TavernCharacterMemoryLayers>;
    scenePresetId: VisualPresetId;
    createdAt: number;
  },
): TavernScene => {
  const timestampNow = getCurrentTimestamp();
  const updatedAt = numberOrDefault(input.updatedAt, timestampNow);
  const resolvedCharacterIds = input.characterIds ?? characterIds;
  const resolvedActiveCharacterId = pickActiveCharacterId(
    input.activeCharacterId ?? activeCharacterId,
    resolvedCharacterIds,
  );

  return {
    title: pickText(input.title, defaultSceneTitle),
    scenePresetId: input.scenePresetId ?? scenePresetId,
    scene: pickText(input.scene, "一张空桌、一盏低灯，以及等待被写下的第一句对白。"),
    sceneGoal: pickText(input.sceneGoal),
    plot: pickText(input.plot),
    storyDirection: pickText(input.storyDirection),
    transition: pickText(input.transition),
    relationshipOverrides: input.relationshipOverrides ?? [],
    sceneStatus: input.sceneStatus,
    characterPublicStatuses: input.characterPublicStatuses ?? {},
    characterPrivateStatuses: input.characterPrivateStatuses ?? {},
    pendingInteractions: input.pendingInteractions ?? [],
    replyOptions: input.replyOptions ?? [],
    characterIds: resolvedCharacterIds,
    activeCharacterId: resolvedActiveCharacterId,
    promptOverrides: createScenePromptOverrides(input.promptOverrides),
    memoryLayers: createSceneMemoryLayers({ ...input.memoryLayers, updatedAt }),
    characterMemoryLayers: Object.fromEntries(
      resolvedCharacterIds.map((characterId) => [
        characterId,
        createCharacterMemoryLayers({
          ...characterMemoryLayers[characterId],
          ...input.characterMemoryLayers?.[characterId],
          updatedAt,
        }),
      ]),
    ),
    createdAt: numberOrDefault(input.createdAt, createdAt),
    updatedAt,
  };
};

const createInputCharacter = (
  input: Partial<TavernCharacter> & Pick<TavernCharacter, "id" | "name">,
  createdAt: number,
): TavernCharacter => ({
  id: input.id.trim(),
  name: input.name.trim(),
  avatar: pickText(input.avatar),
  description: pickText(input.description),
  speakingStyle: pickText(input.speakingStyle),
  writingStyle: trimText(input.writingStyle) || undefined,
  replyStylePrompt: trimText(input.replyStylePrompt) || undefined,
  goals: trimText(input.goals) || undefined,
  relationships: input.relationships ?? [],
  createdAt: numberOrDefault(input.createdAt, createdAt),
  updatedAt: numberOrDefault(input.updatedAt, createdAt),
});

const createInputLorebookEntry = (
  input: Partial<TavernLorebookEntry> & Pick<TavernLorebookEntry, "title" | "content">,
  createdAt: number,
): TavernLorebookEntry => ({
  id: trimText(input.id) || createTimestampId("lore"),
  title: input.title.trim(),
  content: input.content.trim(),
  keywords: unique((input.keywords ?? []).map(trimText)),
  enabled: input.enabled !== false,
  alwaysOn: Boolean(input.alwaysOn),
  createdAt: numberOrDefault(input.createdAt, createdAt),
  updatedAt: numberOrDefault(input.updatedAt, createdAt),
});

const resolveCharacterIds = ({
  requestedCharacterIds,
  characters,
}: {
  requestedCharacterIds?: string[];
  characters: TavernCharacter[];
}) => {
  return requestedCharacterIds ?? characters.map((character) => character.id);
};

const createStoryBinding = (storyId: string, boundAt = getCurrentTimestamp()): TavernStoryBinding => ({
  version: 1,
  storyId,
  source: "story",
  boundAt,
});

const createOpeningMessage = ({
  input,
  room,
  createdAt,
}: {
  input: NonNullable<TavernRoomOpeningInput["openingMessages"]>[number];
  room: TavernRoomRuntime;
  createdAt: number;
}): TavernMessage => {
  const content = trimText(input.text);

  if (input.role === "character") {
    const publicField = room.presentation.profile.profileId === "novel-prose" ? "narrative" : "publicReply";

    return {
      id: trimText(input.id) || createTimestampId("message"),
      roomId: room.identity.id,
      kind: "character_agent_output",
      role: "character",
      characterId: input.characterId,
      presentationProfileId: room.presentation.profile.profileId,
      body: createTavernAgentOutputFieldMessageBody({
        field: publicField,
        text: content,
      }),
      createdAt: numberOrDefault(input.createdAt, createdAt),
      status: input.status ?? "done",
    };
  }

  const role = input.role;
  const body =
    role === "user"
      ? createTavernTextMessageBody(content)
      : createTavernAgentOutputFieldMessageBody({
          field: "narrative",
          text: content,
        });

  return {
    id: trimText(input.id) || createTimestampId("message"),
    roomId: room.identity.id,
    kind: role === "user" ? "user_text" : "director_narration",
    role,
    presentationProfileId: room.presentation.profile.profileId,
    body,
    createdAt: numberOrDefault(input.createdAt, createdAt),
    status: input.status ?? "done",
  };
};

const createRuntimeFromOpeningInput = ({
  workspaceId,
  tavernRoom,
  openingInput,
  roomId,
  createdAt,
}: {
  workspaceId: string;
  tavernRoom: TavernRoomConfig;
  openingInput: TavernRoomOpeningInput;
  roomId: string;
  createdAt: number;
}): TavernRoomRuntime => {
  const characters = (openingInput.cast?.characters ?? []).map((character) =>
    createInputCharacter(character, createdAt),
  );
  const characterIds = resolveCharacterIds({
    requestedCharacterIds: openingInput.cast?.characterIds,
    characters,
  });
  const activeCharacterId = openingInput.cast?.activeCharacterId ?? characterIds[0] ?? "";
  const characterMemoryLayers = Object.fromEntries(
    (openingInput.cast?.characters ?? []).map((character) => [
      character.id,
      createCharacterMemoryLayers(character.memoryLayers),
    ]),
  );
  const presentation = tavernRoom.presentation;
  const settings = mergeRoomSettings(tavernRoom.settings, openingInput.runtime?.settings);
  const prompt = mergePromptSettings(tavernRoom.prompt, openingInput.runtime?.prompt);
  const replyMode = openingInput.runtime?.replyMode ?? tavernRoom.replyMode;
  const scene = createScene(openingInput.scene, {
    characterIds,
    activeCharacterId,
    characterMemoryLayers,
    scenePresetId: tavernRoom.scenePresetId,
    createdAt,
  });
  const title = trimText(openingInput.title) || tavernRoom.title || "故事演绎";
  const storyGraph = openingInput.story?.graph ?? createDefaultStoryGraph(scene.title);
  const storyBinding =
    openingInput.source?.type === "story" ? createStoryBinding(openingInput.source.id, createdAt) : undefined;
  const roomConfig: TavernRoomConfig = {
    ...tavernRoom,
    id: roomId,
    workspaceId,
    title,
    creationSource: openingInput.runtime?.creationSource ?? tavernRoom.creationSource ?? "manual",
    presentation,
    prompt,
    scenePresetId: scene.scenePresetId,
    replyMode,
    settings,
    createdAt: tavernRoom.createdAt ?? createdAt,
    updatedAt: createdAt,
  };

  return {
    version: 1,
    identity: {
      id: roomConfig.id,
      workspaceId: roomConfig.workspaceId,
      title: roomConfig.title,
      creationSource: roomConfig.creationSource,
      createdAt: roomConfig.createdAt,
      updatedAt: createdAt,
    },
    config: {
      room: roomConfig,
    },
    presentation: {
      profile: presentation,
      prompt,
      settings,
      scenePresetId: scene.scenePresetId,
      replyMode,
    },
    story: {
      binding: storyBinding,
      outline: trimText(openingInput.story?.outline),
      goal: trimText(openingInput.story?.goal),
      graph: storyGraph,
    },
    cast: {
      characters,
      characterIds,
      activeCharacterId,
    },
    scene,
    world: {
      lorebookEntries: (openingInput.world?.lorebookEntries ?? []).map((entry) =>
        createInputLorebookEntry(entry, createdAt),
      ),
    },
    user: {
      personaName: trimText(openingInput.userPersonaName) || "我",
    },
  };
};

export const createTavernRoomSessionState = ({
  tavernRoom,
  openingInput,
}: {
  tavernRoom: TavernRoomConfig;
  openingInput: TavernRoomOpeningInput;
}): TavernRoomSessionState => {
  const createdAt = getCurrentTimestamp();
  const room = createRuntimeFromOpeningInput({
    workspaceId: tavernRoom.workspaceId,
    tavernRoom,
    openingInput,
    roomId: tavernRoom.id,
    createdAt,
  });
  const messages = (openingInput.openingMessages ?? []).map((message) =>
    createOpeningMessage({
      input: message,
      room,
      createdAt,
    }),
  );

  return {
    runtime: room,
    messages:
      messages.length > 0
        ? messages
        : [
            {
              id: createTimestampId("message"),
              roomId: room.identity.id,
              kind: "director_narration",
              role: "narrator",
              presentationProfileId: room.presentation.profile.profileId,
              body: createTavernAgentOutputFieldMessageBody({
                field: "narrative",
                text: "故事演绎已经准备好。",
              }),
              createdAt,
              status: "done",
            },
          ],
  };
};
