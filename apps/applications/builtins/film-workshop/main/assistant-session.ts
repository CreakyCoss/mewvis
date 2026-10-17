import {
  getApplicationChatClient,
  type ApplicationChatSession,
  type ChatContext,
  type ChatRunConfig,
} from "@mewvis/app-sdk/chat";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import type { FilmProject } from "./model";
import { FILM_ASSISTANT_INSTRUCTIONS } from "./assistant/instructions";

export type SessionRef = {
  workspaceId: string;
  chatId: string;
  profileVersion?: number;
};
const profileVersion = 5;
export const assistantProfileKey = (chatId: string) =>
  `film:assistant-profile:${chatId}`;
export const connections = new Map<string, Promise<ApplicationChatSession>>();
export const assistantKey = (project: FilmProject, episodeId: string) =>
  project.workspace
    ? `film:assistant:v2:${project.id}:${episodeId}:${project.workspace.id}`
    : `film:assistant:${project.id}:${episodeId}`;
export async function reference(key: string) {
  const previous =
    await getApplicationDataClient().storage.getItem<SessionRef>(key);
  if (
    previous &&
    (typeof previous.workspaceId !== "string" ||
      typeof previous.chatId !== "string")
  )
    throw new Error("助手会话索引无效");
  return previous;
}
export async function createSession(
  key: string,
  workspaceId?: string,
  context?: ChatContext,
  config?: Partial<ChatRunConfig>,
) {
  const data = getApplicationDataClient();
  if (!workspaceId) {
    const workspaces = await data.workspaces.list();
    workspaceId = (
      workspaces.find((workspace) => workspace.isDefault) ?? workspaces[0]
    )?.id;
  }
  if (!workspaceId) throw new Error("请先选择影视项目工作目录");
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
    if (config) {
      const updated = await session.updateConfig(config);
      if (!updated.ok) throw new Error(updated.error);
    }
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
  workspaceId?: string,
): Promise<ApplicationChatSession> {
  const previous = await reference(key);
  if (previous) {
    if (workspaceId && previous.workspaceId !== workspaceId)
      throw new Error("助手会话与项目工作区不一致");
    // Profiles are immutable host records. Keep the old conversation in history
    // and start the updated tool profile under the same project/episode scene.
    if (previous.profileVersion !== profileVersion) {
      let config: Partial<ChatRunConfig> | undefined;
      try {
        const saved = (
          await getApplicationChatClient().openSession({
            workspaceId: previous.workspaceId,
            chatId: previous.chatId,
          })
        ).getSnapshot().config;
        if (saved?.selectedModelId)
          config = {
            selectedModelId: saved.selectedModelId,
            thinkingLevel: saved.thinkingLevel,
            permissionMode: saved.permissionMode,
          };
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "未找到聊天记录")
          throw error;
      }
      return createSession(
        key,
        workspaceId ?? previous.workspaceId,
        undefined,
        config,
      );
    }
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
  return createSession(key, workspaceId ?? previous?.workspaceId);
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
