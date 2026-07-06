import type { TavernRoom } from "@/features/pages/taverns/manage/model";

export type TavernBridgeSessionInput = {
  workspacePath: string;
  room: TavernRoom;
};
