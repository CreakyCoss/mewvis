import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter, TavernRoom } from "@/features/pages/taverns/manage/model";

export type TavernQuickSummaryInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  storyContext?: TavernStoryContextPackage;
};
