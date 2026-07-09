import { deleteLedger } from "@/features/ai/components/conversation-ledger/api";
import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { tavernAgentFlowSessionRootDir } from "./roles";

export const deleteTavernAgentFlowSession = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: TavernRoomRuntime;
}) => {
  const results = await Promise.allSettled([
    deleteLedger({
      workspacePath,
      sessionRootDir: tavernAgentFlowSessionRootDir(room),
    }),
  ]);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};
