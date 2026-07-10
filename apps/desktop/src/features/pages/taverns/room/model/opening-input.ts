import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernRoom as TavernRoomConfig,
  TavernRoomPromptSettings,
  TavernRoomSettings,
  TavernScenePromptOverrides,
} from "@/features/pages/taverns/manage/model";
import type { TavernCharacterMemoryLayers, TavernScene, TavernSceneMemoryLayers, TavernStoryGraph } from "./standard";

export type TavernRoomOpeningInput = {
  version?: 1;
  source?: { label?: string } & ({ type: "story"; id: string } | { type: "manual" | "import"; id?: string });
  title?: string;
  userPersonaName?: string;
  story?: {
    outline?: string;
    goal?: string;
    graph?: TavernStoryGraph;
  };
  cast?: {
    characters?: Array<
      Partial<TavernCharacter> &
        Pick<TavernCharacter, "id" | "name"> & { memoryLayers?: Partial<TavernCharacterMemoryLayers> }
    >;
    characterIds?: string[];
    activeCharacterId?: string;
  };
  scene?: Partial<Omit<TavernScene, "promptOverrides" | "memoryLayers" | "characterMemoryLayers">> & {
    promptOverrides?: Partial<TavernScenePromptOverrides>;
    memoryLayers?: Partial<TavernSceneMemoryLayers>;
    characterMemoryLayers?: Record<string, Partial<TavernCharacterMemoryLayers>>;
  };
  world?: {
    lorebookEntries?: Array<Partial<TavernLorebookEntry> & Pick<TavernLorebookEntry, "title" | "content">>;
  };
  runtime?: {
    prompt?: Partial<TavernRoomPromptSettings>;
    settings?: Partial<TavernRoomSettings>;
    replyMode?: TavernRoomConfig["replyMode"];
    creationSource?: TavernRoomConfig["creationSource"];
  };
  openingMessages?: Array<
    {
      id?: string;
      text: string;
      createdAt?: number;
      status?: Exclude<TavernMessage["status"], "streaming">;
    } & ({ role: "character"; characterId: string } | { role: "user" | "narrator"; characterId?: never })
  >;
};
