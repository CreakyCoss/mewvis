import type { TavernRoomConfig } from "@/features/pages/stories/tavern/manage/model";
import type { StoryContext } from "../../../../../../../core/story-project/types";

export type TavernCharacterMemory = {
  required: string;
  public: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
};

export type TavernCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationshipSummary?: string;
  publicRelationshipSummary?: string;
  memory?: TavernCharacterMemory;
};

export type TavernStoryData = {
  /** 酒馆只绑定稳定章节 ID；章节号和标题由 context 提供。 */
  chapterId: string;
  context: StoryContext;
  characters: TavernCharacter[];
  roomConfig: TavernRoomConfig;
};
