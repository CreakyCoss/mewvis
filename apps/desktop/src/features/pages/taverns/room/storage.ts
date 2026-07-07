import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TavernRuntimeScope } from "../storage";
import type { TavernMessage } from "../tavern/types";

const TAVERN_SOURCE_DIR = "tavern";
const TAVERN_MESSAGES_FILE_NAME = "messages.json";
const TAVERN_CONVERSATION_FILE_NAME = "conversation.json";

const normalizeSlashes = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");

const runtimePathToWorkspaceRelativePath = (workspacePath: string, runtimePath: string) => {
  const workspaceRoot = normalizeSlashes(workspacePath);
  const runtimeRoot = normalizeSlashes(runtimePath);
  if (!runtimeRoot) {
    return TAVERN_SOURCE_DIR;
  }

  if (runtimeRoot === workspaceRoot) {
    return TAVERN_SOURCE_DIR;
  }

  if (runtimeRoot.startsWith(`${workspaceRoot}/`)) {
    return runtimeRoot.slice(workspaceRoot.length + 1);
  }

  return runtimeRoot.replace(/^\/+/g, "");
};

const tavernBaseDir = (workspacePath: string, scope: TavernRuntimeScope = {}) =>
  scope.runtimePath?.trim() ? runtimePathToWorkspaceRelativePath(workspacePath, scope.runtimePath) : TAVERN_SOURCE_DIR;

const joinPath = (...parts: string[]) =>
  parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

const tavernMessagesPath = (baseDir: string) => joinPath(baseDir, TAVERN_MESSAGES_FILE_NAME);

const tavernConversationPath = (baseDir: string) => joinPath(baseDir, TAVERN_CONVERSATION_FILE_NAME);

const readJsonWorkspaceFile = async (workspacePath: string, relativePath: string): Promise<unknown | null> => {
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    return JSON.parse(file.content);
  } catch {
    return null;
  }
};

const writeJsonWorkspaceFile = async (workspacePath: string, relativePath: string, value: unknown) => {
  await invoke("write_workspace_file", {
    input: {
      workspacePath,
      relativePath,
      content: JSON.stringify(value, null, 2),
    },
  });
};

const normalizeTavernRuntimeMessages = (value: unknown): TavernMessage[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((message) => {
    if (!message || typeof message !== "object") {
      return [];
    }

    const candidate = message as Partial<TavernMessage>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.roomId !== "string" ||
      typeof candidate.content !== "string" ||
      typeof candidate.createdAt !== "number" ||
      (candidate.role !== "user" && candidate.role !== "character" && candidate.role !== "narrator")
    ) {
      return [];
    }

    return [candidate as TavernMessage];
  });
};

export const loadTavernRuntimeMessages = async (
  workspacePath: string,
  scope: TavernRuntimeScope = {},
): Promise<TavernMessage[] | null> => {
  if (!scope.runtimePath?.trim() || !isTauri()) {
    return null;
  }

  const baseDir = tavernBaseDir(workspacePath, scope);
  const messages = normalizeTavernRuntimeMessages(
    await readJsonWorkspaceFile(workspacePath, tavernMessagesPath(baseDir)),
  );
  if (messages) {
    return messages;
  }

  return normalizeTavernRuntimeMessages(await readJsonWorkspaceFile(workspacePath, tavernConversationPath(baseDir)));
};

export const saveTavernRuntimeMessages = async (
  workspacePath: string,
  scope: TavernRuntimeScope = {},
  messages: TavernMessage[],
) => {
  if (!scope.runtimePath?.trim() || !isTauri()) {
    return;
  }

  const baseDir = tavernBaseDir(workspacePath, scope);
  await Promise.all([
    writeJsonWorkspaceFile(workspacePath, tavernMessagesPath(baseDir), messages),
    writeJsonWorkspaceFile(workspacePath, tavernConversationPath(baseDir), messages),
  ]);
};
