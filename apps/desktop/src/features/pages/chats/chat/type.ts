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

export type ChatToolEvent = {
  id: string;
  kind: "input" | "update" | "output";
  content: string;
  isError?: boolean;
};

export type ChatAssistantMessageBlock =
  | {
      id: string;
      type: "thinking";
      content: string;
      isCollapsed?: boolean;
    }
  | {
      id: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      type: "tool";
      name: string;
      events: ChatToolEvent[];
      isCollapsed?: boolean;
      status: "running" | "done" | "error";
    };

export type ChatUserMessageBlock =
  | {
      id: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      type: "file-reference";
      path: string;
    }
  | {
      id: string;
      type: "skill-reference";
      skillKey: string;
      name: string;
    };

type ChatMessageBase = {
  id: string;
  createdAt: number;
  status?: "loading" | "streaming" | "done" | "error";
};

export type ChatUserMessage = ChatMessageBase & {
  role: "user";
  blocks: ChatUserMessageBlock[];
};

export type ChatAssistantMessage = ChatMessageBase & {
  role: "assistant";
  blocks: ChatAssistantMessageBlock[];
  agentAvatar?: string;
  agentName?: string;
  showThinkingProcess?: boolean;
  showToolCallProcess?: boolean;
};

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

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
