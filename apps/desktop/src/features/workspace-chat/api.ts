import { invoke } from "@tauri-apps/api/core";
import { createAgentRuntime } from "@/agent-runtime/runtime";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import {
  toAgentRuntimeModelConfig,
  toAgentRuntimeProviderConfig,
} from "./utils/agent-runtime-config";
import type { ChatContextSummary, ChatMessage, ChatSession, ChatSessionMeta, WorkspaceFile, WorkspaceFileEntry } from "./types";
import type { ConversationMessage } from "./types";

const agentRuntime = createAgentRuntime();

export type RunAgentRuntimeChatInput = {
  agentId?: string;
  provider?: LlmProvider | null;
  model?: ProviderModel | null;
  systemPrompt: string;
  messages: ConversationMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type RunAgentRuntimeChatOutput = {
  text: string;
  thinking?: string | null;
};

export async function listWorkspaceFiles(workspacePath: string) {
  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string,
) {
  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
) {
  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function runAgentRuntimeChat(
  input: RunAgentRuntimeChatInput,
): Promise<RunAgentRuntimeChatOutput> {
  return agentRuntime.run({
    type: "chat",
    agentId: input.agentId,
    provider: input.provider ? toAgentRuntimeProviderConfig(input.provider) : undefined,
    model: input.provider && input.model
      ? toAgentRuntimeModelConfig(input.provider, input.model)
      : undefined,
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta: input.onTextDelta,
    onThinkingDelta: input.onThinkingDelta,
  });
}

export async function listChatSessions(workspacePath: string) {
  return invoke<ChatSessionMeta[]>("list_chat_sessions", {
    input: { workspacePath },
  });
}

export async function loadChatSession(
  workspacePath: string,
  sessionId?: string | null,
) {
  return invoke<ChatSession | null>("load_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function saveChatSession(input: {
  workspacePath: string;
  sessionId?: string | null;
  title?: string | null;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
  context?: ChatContextSummary | null;
}) {
  return invoke<ChatSession>("save_chat_session", { input });
}

export async function deleteChatSession(workspacePath: string, sessionId: string) {
  return invoke<ChatSessionMeta[]>("delete_chat_session", {
    input: { workspacePath, sessionId },
  });
}
