import { invoke } from "@tauri-apps/api/core";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { WorkspaceFile, WorkspaceFileEntry } from "./types";
import type { ConversationMessage } from "./types";

export type ChatWithLlmInput = {
  provider: LlmProvider;
  model: ProviderModel;
  systemPrompt: string;
  messages: ConversationMessage[];
};

export type ChatWithLlmOutput = {
  text: string;
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

export async function chatWithLlm(input: ChatWithLlmInput) {
  return invoke<ChatWithLlmOutput>("chat_with_llm", { input });
}
