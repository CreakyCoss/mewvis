import { deleteWorkspaceFile } from "@/platform/files";
import type { TavernMessage } from "./model/message";
import { workspaceFile } from "@/platform/files";

const TAVERN_MESSAGES_FILE_NAME = "messages.json";
type TavernRoomFiles = { messages: TavernMessage[] };

export const loadTavernRoom = async (
  workspacePath: string,
): Promise<TavernRoomFiles | null> => {
  if (!workspacePath.trim()) {
    return null;
  }

  const messages = await workspaceFile(
    workspacePath,
    TAVERN_MESSAGES_FILE_NAME,
  ).readJson<TavernMessage[]>();
  if (!messages) {
    return null;
  }

  return { messages };
};

export const saveTavernRoom = async (
  workspacePath: string,
  messages: TavernMessage[],
) => {
  if (!workspacePath.trim()) {
    return;
  }

  await workspaceFile(workspacePath, TAVERN_MESSAGES_FILE_NAME).writeJson(
    messages,
  );
};

export const deleteTavernRoom = async (workspacePath: string) => {
  if (!workspacePath.trim()) {
    return;
  }

  await deleteWorkspaceFile(workspacePath, TAVERN_MESSAGES_FILE_NAME);
};
