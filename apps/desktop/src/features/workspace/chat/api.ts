import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import {
  runSharedRuntimeChat,
  type RunSharedRuntimeChatInput,
  type RunSharedRuntimeChatOutput,
} from "@/features/ai/runtime";
import type {
  AgentSessionStatus,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
  CleanupAgentSessionsResult,
  CreateWorkspaceVersionResult,
  WorkspaceVersion,
  WorkspaceVersionFileContent,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
  WorkspaceVersionControlStatus,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "./types";

export type RunAgentRuntimeChatInput = RunSharedRuntimeChatInput;
export type RunAgentRuntimeChatOutput = RunSharedRuntimeChatOutput;

export async function listWorkspaceFiles(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持读取工作区文件");
  }

  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持保存工作区文件");
  }

  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function deleteWorkspaceFile(
  workspacePath: string,
  relativePath: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持删除工作区文件");
  }

  return invoke<void>("delete_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function getWorkspaceVersionControlStatus(workspacePath: string) {
  if (!isTauri()) {
    return {
      isEnabled: false,
      provider: null,
      currentRef: null,
      head: null,
      branches: [],
      hasVersions: false,
      hasChanges: false,
      changedFileCount: 0,
      counts: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        typechange: 0,
        conflicted: 0,
        untracked: 0,
      },
      files: [],
    } satisfies WorkspaceVersionControlStatus;
  }

  return invoke<WorkspaceVersionControlStatus>("get_workspace_version_control_status", {
    input: { workspacePath },
  });
}

export async function initializeWorkspaceVersionControl(workspacePath: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持初始化工作区版本库");
  }

  return invoke<WorkspaceVersionControlStatus>("initialize_workspace_version_control", {
    input: { workspacePath },
  });
}

export async function getWorkspaceVersionFileDiff(
  workspacePath: string,
  relativePath: string,
) {
  if (!isTauri()) {
    return {
      path: relativePath,
      patch: "",
      beforeContent: "",
      afterContent: "",
    } satisfies WorkspaceVersionFileDiff;
  }

  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_file_diff", {
    input: { workspacePath, relativePath },
  });
}

export async function discardWorkspaceVersionFileChanges(
  workspacePath: string,
  relativePath: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持撤销文件修改");
  }

  return invoke<WorkspaceVersionControlStatus>(
    "discard_workspace_version_file_changes",
    {
      input: { workspacePath, relativePath },
    },
  );
}

export async function createWorkspaceVersion(
  workspacePath: string,
  message: string,
  relativePaths?: string[],
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持提交工作区变更");
  }

  return invoke<CreateWorkspaceVersionResult>("create_workspace_version", {
    input: { workspacePath, message, relativePaths },
  });
}

export async function createWorkspaceVersionBranch(
  workspacePath: string,
  branchName: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持创建工作区分支");
  }

  return invoke<WorkspaceVersionControlStatus>("create_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function switchWorkspaceVersionBranch(
  workspacePath: string,
  branchName: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持切换工作区分支");
  }

  return invoke<WorkspaceVersionControlStatus>("switch_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersions(workspacePath: string, branchName?: string) {
  if (!isTauri()) {
    return [] satisfies WorkspaceVersion[];
  }

  return invoke<WorkspaceVersion[]>("list_workspace_versions", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersionFiles(
  workspacePath: string,
  versionId: string,
) {
  if (!isTauri()) {
    return [] satisfies WorkspaceVersionFileEntry[];
  }

  return invoke<WorkspaceVersionFileEntry[]>("list_workspace_version_files", {
    input: { workspacePath, versionId },
  });
}

export async function readWorkspaceVersionFile(
  workspacePath: string,
  versionId: string,
  relativePath: string,
) {
  if (!isTauri()) {
    return {
      path: relativePath,
      content: "",
      size: 0,
    } satisfies WorkspaceVersionFileContent;
  }

  return invoke<WorkspaceVersionFileContent>("read_workspace_version_file", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function getWorkspaceVersionCommitFileDiff(
  workspacePath: string,
  versionId: string,
  relativePath: string,
) {
  if (!isTauri()) {
    return {
      path: relativePath,
      patch: "",
      beforeContent: "",
      afterContent: "",
    } satisfies WorkspaceVersionFileDiff;
  }

  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_commit_file_diff", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function restoreWorkspaceVersion(
  workspacePath: string,
  versionId: string,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持回退工作区版本");
  }

  return invoke<WorkspaceVersionControlStatus>("restore_workspace_version", {
    input: { workspacePath, versionId },
  });
}

export async function runAgentRuntimeChat(
  input: RunAgentRuntimeChatInput,
): Promise<RunAgentRuntimeChatOutput> {
  return runSharedRuntimeChat(input);
}

export type AgentRuntimeSessionMessage = {
  messageRecordId: string;
  role: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type AgentRuntimeSessionAuxiliaryEntry = {
  recordId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type AgentRuntimeSessionMessageInput = {
  role: string;
  content: string;
  timestamp?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateAgentRuntimeSessionInput = {
  workspacePath: string;
  sessionRootDir: string;
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentRuntimeDisplaySummary = {
  recordId: string;
  targetLeafId: string;
  summary: string;
  timestamp: number;
  generatedAt: number;
  summaryInstruction?: string | null;
  runtimeId?: string | null;
  modelId?: string | null;
  sourceCharCount?: number | null;
  chunkCount?: number | null;
  llmCallCount?: number | null;
  messageCount?: number | null;
  entryCount?: number | null;
};

export type AgentRuntimeLink = {
  linkId: string;
  runtime?: string | null;
  runtimeId?: string | null;
  agentRoleId?: string | null;
  agentSessionId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  streamId?: string | null;
  turnId?: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  systemMessageRecordId?: string | null;
  userMessageRecordId?: string | null;
  assistantMessageRecordIds: string[];
  requestContextRecordIds: string[];
  runtimeInstructionRecordIds: string[];
  messageRecordIds: string[];
  status?: "running" | "done" | "error" | null;
  startedAt?: number | null;
  endedAt?: number | null;
};

export type AgentRuntimeSessionResult = {
  type: "session_result" | "session_mutation_result";
  requestId?: string | null;
  sessionRootDir: string;
  summary: string;
  messages: AgentRuntimeSessionMessage[];
  requestContexts?: AgentRuntimeSessionAuxiliaryEntry[];
  runtimeInstructions?: AgentRuntimeSessionAuxiliaryEntry[];
  displaySummary?: AgentRuntimeDisplaySummary | null;
  displaySummaries?: AgentRuntimeDisplaySummary[];
  runtimeLinks?: AgentRuntimeLink[];
  messageRecordId?: string | null;
  messageRecordIds?: string[];
  compacted?: boolean;
};

export async function createAgentRuntimeSession(input: CreateAgentRuntimeSessionInput) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("create_agent_runtime_session", { input });
}

export async function readAgentRuntimeSession(input: {
  workspacePath: string;
  sessionRootDir: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("read_agent_runtime_session", { input });
}

export async function compactAgentRuntimeSession(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentId?: string | null;
  agentRoleId: string;
  compactInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("compact_agent_runtime_session", { input });
}

export async function summarizeAgentRuntimeSession(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentId?: string | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("summarize_agent_runtime_session", { input });
}

export async function editAgentRuntimeSessionMessage(input: {
  workspacePath: string;
  sessionRootDir: string;
  messageRecordId: string;
  content: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("edit_agent_runtime_session_message", { input });
}

export async function deleteAgentRuntimeSessionMessage(input: {
  workspacePath: string;
  sessionRootDir: string;
  messageRecordId: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>("delete_agent_runtime_session_message", { input });
}

export async function appendAgentRuntimeSessionMessages(input: {
  workspacePath: string;
  sessionRootDir: string;
  messages: AgentRuntimeSessionMessageInput[];
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>(
    "append_agent_runtime_session_messages",
    { input },
  );
}

export async function rebuildAgentRuntimeSession(input: {
  workspacePath: string;
  sessionRootDir: string;
  messages: AgentRuntimeSessionMessageInput[];
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<AgentRuntimeSessionResult>(
    "rebuild_agent_runtime_session",
    { input },
  );
}

export async function listChatSessions(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("list_chat_sessions", {
    input: { workspacePath },
  });
}

export async function loadChatSession(
  workspacePath: string,
  sessionId?: string | null,
) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatSession | null>("load_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function saveChatSession(input: {
  workspacePath: string;
  sessionId?: string | null;
  title?: string | null;
  messages: ChatMessage[];
  isUnread?: boolean;
}) {
  if (!isTauri()) {
    const now = Date.now();
    return {
      id: input.sessionId ?? crypto.randomUUID(),
      title: input.title ?? "新的聊天",
      createdAt: now,
      updatedAt: now,
      messages: input.messages,
      isUnread: input.isUnread ?? false,
    } satisfies ChatSession;
  }

  return invoke<ChatSession>("save_chat_session", {
    input: {
      workspacePath: input.workspacePath,
      sessionId: input.sessionId,
      title: input.title,
      messages: input.messages,
      isUnread: input.isUnread,
    },
  });
}

export async function setChatSessionUnread(input: {
  workspacePath: string;
  sessionId: string;
  isUnread: boolean;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<ChatSessionMeta>("set_chat_session_unread", { input });
}

export async function deleteChatSession(workspacePath: string, sessionId: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<ChatSessionMeta[]>("delete_chat_session", {
    input: { workspacePath, sessionId },
  });
}

export async function getAgentSessionStatus(
  workspacePath: string,
  sessionId?: string | null,
) {
  if (!isTauri()) {
    return {
      exists: false,
      sessionDir: "",
      latestSessionFile: null,
      sessionFileCount: 0,
      totalBytes: 0,
      messageCount: 0,
      toolCallCount: 0,
      activeMessageCount: 0,
      activeToolCallCount: 0,
      estimatedContextTokens: 0,
      tokenUsage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
      },
      tokenUsageMessageCount: 0,
      compactionCount: 0,
      latestCompaction: null,
    } satisfies AgentSessionStatus;
  }

  return invoke<AgentSessionStatus>("get_agent_session_status", {
    input: { workspacePath, sessionId },
  });
}

export async function cleanupOrphanAgentSessions(
  workspacePath: string,
  protectedSessionId?: string | null,
) {
  if (!isTauri()) {
    return {
      removedCount: 0,
      removedBytes: 0,
    } satisfies CleanupAgentSessionsResult;
  }

  return invoke<CleanupAgentSessionsResult>("cleanup_orphan_agent_sessions", {
    input: { workspacePath, protectedSessionId },
  });
}

export async function resetAgentSessionsForChat(workspacePath: string, chatSessionId: string) {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<void>("reset_agent_sessions_for_chat", {
    input: { workspacePath, chatSessionId },
  });
}
