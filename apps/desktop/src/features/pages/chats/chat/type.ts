import type { AskUserInput } from "@/agent-client/types";
import type { ChatInputResources, ChatInputSubmitPayload } from "../components/chat-input/type";

export type ChatInitialData = {
  request?: ChatInputSubmitPayload;
  resources: ChatInputResources;
};

export type ChatStatus = {
  chatId: string;
  isRunning: boolean;
};

export type ChatToolCall = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  status?: "loading" | "streaming" | "done" | "error";
  thinking?: string;
  toolCalls?: ChatToolCall[];
  agentAvatar?: string;
  agentName?: string;
  showThinkingProcess?: boolean;
  showToolCallProcess?: boolean;
};

export type ChatPendingQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type ChatProps = {
  chatId: string;
  workspacePath: string;
  initialData: ChatInitialData;
  onStatusChange?: (status: ChatStatus) => void;
};
