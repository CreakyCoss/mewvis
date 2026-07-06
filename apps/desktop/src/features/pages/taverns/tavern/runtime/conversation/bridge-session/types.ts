import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";

export type TavernBridgeSessionInput = {
  workspacePath: string;
  room: TavernRoom;
};
