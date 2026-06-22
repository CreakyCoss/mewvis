import { tavernBridgeSessionRootDir } from "../../../core";
import type { TavernBridgeSessionInput } from "./types";

export const tavernBridgeSessionInput = ({
  workspacePath,
  room,
}: TavernBridgeSessionInput) => ({
  workspacePath,
  sessionRootDir: tavernBridgeSessionRootDir(room.id),
});
