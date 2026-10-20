import {
  getApplicationChatClient,
  type ApplicationChatSession,
  type ChatContext,
} from "@mewvis/app-sdk/chat";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import type { FilmProject } from "./model";
import { FILM_ASSISTANT_INSTRUCTIONS } from "./assistant/instructions";

export type SessionRef = {
  workspaceId: string;
  chatId: string;
  profileVersion: number;
};
const profileVersion = 5;
export const assistantProfileKey = (chatId: string) =>
  `film:assistant-profile:${chatId}`;
export const connections = new Map<string, Promise<ApplicationChatSession>>();
export function assistantKey(project: FilmProject, episodeId: string) {
  if (!project.workspace) throw new Error("请先选择影视项目工作目录");
  return `film:assistant:v2:${project.id}:${episodeId}:${project.workspace.id}`;
}
function validateProfileVersion(value: unknown) {
  if (value !== profileVersion)
    throw new Error("不支持的助手配置版本，请新建会话");
  return profileVersion;
}
export async function sessionProfileVersion(chatId: string) {
  return validateProfileVersion(
    await getApplicationDataClient().storage.getItem<number>(
      assistantProfileKey(chatId),
    ),
  );
}
export async function reference(key: string) {
  const previous =
    await getApplicationDataClient().storage.getItem<SessionRef>(key);
  if (
    previous &&
    (typeof previous.workspaceId !== "string" ||
      !previous.workspaceId.trim() ||
      typeof previous.chatId !== "string" ||
      !previous.chatId.trim())
  )
    throw new Error("助手会话索引无效");
  if (previous) validateProfileVersion(previous.profileVersion);
  return previous;
}
export async function createSession(
  key: string,
  workspaceId: string | undefined,
  context?: ChatContext,
) {
  if (!workspaceId) throw new Error("请先选择影视项目工作目录");
  const data = getApplicationDataClient();
  const session = await getApplicationChatClient().createSession({
    workspaceId,
    sceneId: key,
    profile: {
      id: "film-assistant-v5",
      introduction:
        "一起把故事变成画面。可以打磨剧本、整理素材、设计分镜，预览建议后按项采用，也可以生成分镜图片、镜头视频和角色配音。",
      systemPrompt: FILM_ASSISTANT_INSTRUCTIONS,
      allowedToolNames: [
        "film_check_delivery",
        "film_propose_changes",
        "film_prepare_media",
        "generate_media",
        "ask_user",
      ],
      context,
    },
  });
  try {
    const saved = await session.flush();
    if (!saved.ok) throw new Error(saved.error);
    await data.storage.setItem(
      assistantProfileKey(session.identity.id),
      profileVersion,
    );
    await data.storage.setItem(key, {
      workspaceId,
      chatId: session.identity.id,
      profileVersion,
    });
  } catch (error) {
    await session.close();
    throw error;
  }
  return session;
}
export async function connect(
  key: string,
  workspaceId: string | undefined,
): Promise<ApplicationChatSession> {
  if (!workspaceId) throw new Error("请先选择影视项目工作目录");
  const previous = await reference(key);
  if (previous) {
    if (previous.workspaceId !== workspaceId)
      throw new Error("助手会话与项目工作区不一致");
    try {
      return await getApplicationChatClient().openSession({
        workspaceId: previous.workspaceId,
        chatId: previous.chatId,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "未找到聊天记录")
        throw error;
    }
  }
  return createSession(key, workspaceId);
}
export function projectSession(project: FilmProject, episodeId: string) {
  const key = assistantKey(project, episodeId);
  let pending = connections.get(key);
  if (!pending) {
    pending = connect(key, project.workspace?.id);
    connections.set(key, pending);
    void pending.catch(() => {
      if (connections.get(key) === pending) connections.delete(key);
    });
  }
  return pending;
}
