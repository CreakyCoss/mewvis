import type { RuntimeModelInput } from "@/agent-client/protocol";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";

export type TavernQuickSummaryInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
};
