import { resolveLlmModel } from "@/api/llm";
import { summarizeLedger } from "@/api/conversation-ledger";
export async function summarizeChatLedger({
  selectedModelId,
  ...input
}: {
  workspacePath: string;
  sessionRootDir: string;
  selectedModelId: string;
  summaryInstruction: string;
}) {
  const runtimeModel = await resolveLlmModel(selectedModelId);
  return summarizeLedger({ ...input, runtimeModel });
}
