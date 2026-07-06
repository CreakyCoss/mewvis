export type TavernRuntimeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata?: {
    executionSummary?: string;
    runStatus?: "done" | "error";
    runtimeSessionId?: string | null;
  } | null;
};

const roleLabel = (role: TavernRuntimeMessage["role"]) =>
  role === "user" ? "用户" : "助手";

export const formatTavernRuntimeMessagesForSummary = (
  messages: TavernRuntimeMessage[],
) => messages
  .map((message) => `${roleLabel(message.role)}：${message.content}`)
  .join("\n\n");
