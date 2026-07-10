import { deleteLedger } from "@/features/ai/components/conversation-ledger/api";
import type { TavernStoryData } from "@/features/pages/taverns/room/model";
import type { TavernAgentFlowSessionInput } from "../types";

const sanitizeSessionSegment = (value: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment;
};

export const tavernAgentFlowSessionRootDir = (story: TavernStoryData) =>
  `tavern/${sanitizeSessionSegment(story.id)}/${sanitizeSessionSegment(story.roomConfig.id)}/agent-flow`;

export const deleteTavernAgentFlowSession = async ({ workspacePath, story }: TavernAgentFlowSessionInput) => {
  const results = await Promise.allSettled([
    deleteLedger({
      workspacePath,
      sessionRootDir: tavernAgentFlowSessionRootDir(story),
    }),
  ]);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};
