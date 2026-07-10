import { deleteLedger } from "@/features/ai/components/conversation-ledger/api";
import type { TavernAgentFlowSessionInput } from "../types";

export const tavernAgentFlowSessionRootDir = () => "session";

export const deleteTavernAgentFlowSession = async ({ workspacePath }: TavernAgentFlowSessionInput) => {
  const results = await Promise.allSettled([
    deleteLedger({
      workspacePath,
      sessionRootDir: tavernAgentFlowSessionRootDir(),
    }),
  ]);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};
