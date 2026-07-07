import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import { deleteLedger } from "@/features/ai/components/conversation-ledger/api";
import { tavernBridgeSessionRootDir } from "../../core/agent-role";

export const deleteTavernBridgeSession = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id" | "activeSceneId" | "activeSceneInstanceId" | "scenes" | "sceneInstances">;
}) => {
  const sessionRootDirs = Array.from(new Set([tavernBridgeSessionRootDir(room)]));
  const results = await Promise.allSettled(
    sessionRootDirs.map((sessionRootDir) => deleteLedger({ workspacePath, sessionRootDir })),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};
