import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";

export type TavernQuickSummaryInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  storyContext?: TavernStoryContextPackage;
};
