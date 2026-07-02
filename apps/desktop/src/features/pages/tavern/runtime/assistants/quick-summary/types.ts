import type { RuntimeModelInput } from "@/agent-client/types";
import type { StoryContextPackage } from "@/features/story";
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
  storyContext?: StoryContextPackage;
};
