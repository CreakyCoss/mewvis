import type { StoryNodeScene } from "@/features/pages/stories/story/model/node";
import type { StoryCharacterJson } from "@/features/pages/stories/story/model/types";
import type { TavernRoomConfig } from "@/features/pages/stories/tavern/manage/model";

export type TavernCharacter = StoryCharacterJson;

export type TavernStoryData = StoryNodeScene & {
  roomConfig: TavernRoomConfig;
};
