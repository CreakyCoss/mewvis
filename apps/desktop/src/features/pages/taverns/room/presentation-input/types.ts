import type { TavernMessage } from "../../tavern/types";
import type {
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernCharacterRelationship,
  TavernLorebookEntry,
  TavernPresentationSettings,
  TavernRoom,
  TavernRoomPromptSettings,
  TavernRoomSettings,
} from "@/features/pages/taverns/manage/model";
import type { TavernScene, TavernStoryGraph } from "@/features/pages/taverns/room/model";

export type TavernPresentationInputSource = {
  type: "story" | "manual" | "import";
  id?: string;
  label?: string;
};

export type TavernPresentationCharacterInput = {
  id?: string;
  name: string;
  avatar?: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
  memory?: string;
  publicStatus?: Partial<TavernCharacterPublicStatus>;
  privateStatus?: Partial<TavernCharacterPrivateStatus>;
};

export type TavernPresentationLorebookEntryInput = Pick<
  TavernLorebookEntry,
  "title" | "content" | "keywords" | "enabled" | "alwaysOn"
> &
  Partial<Pick<TavernLorebookEntry, "id" | "createdAt" | "updatedAt">>;

export type TavernPresentationSceneInput = Pick<
  TavernScene,
  "title" | "scene" | "sceneGoal" | "plot" | "storyDirection" | "transition" | "memory"
> &
  Partial<
    Pick<
      TavernScene,
      | "id"
      | "order"
      | "scenePresetId"
      | "relationshipOverrides"
      | "sceneStatus"
      | "characterPublicStatuses"
      | "characterPrivateStatuses"
      | "characterMemories"
      | "characterIds"
      | "activeCharacterId"
      | "createdAt"
      | "updatedAt"
    >
  >;

export type TavernPresentationOpeningMessageInput = {
  role: TavernMessage["role"];
  characterId?: string;
  content: string;
};

export type TavernPresentationRuntimeInput = {
  presentation?: Partial<TavernPresentationSettings>;
  prompt?: Partial<TavernRoomPromptSettings>;
  settings?: Partial<TavernRoomSettings>;
  replyMode?: TavernRoom["replyMode"];
  creationSource?: TavernRoom["creationSource"];
};

export type TavernPresentationInput = {
  version: 1;
  source: TavernPresentationInputSource;
  meta: {
    title: string;
    userPersonaName: string;
  };
  world: {
    outline: string;
    goal: string;
    lorebookEntries: TavernPresentationLorebookEntryInput[];
  };
  cast: {
    characters: TavernPresentationCharacterInput[];
    characterIds?: string[];
    activeCharacterId?: string;
  };
  route: {
    graph: TavernStoryGraph;
    activeNodeId: string;
  };
  scenes: {
    items: TavernPresentationSceneInput[];
    activeSceneId?: string;
  };
  runtime?: TavernPresentationRuntimeInput;
  opening?: {
    messages: TavernPresentationOpeningMessageInput[];
  };
};
