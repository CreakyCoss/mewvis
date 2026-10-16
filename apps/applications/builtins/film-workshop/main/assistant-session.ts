import {
  getApplicationChatClient,
  type ApplicationChatSession,
  type ChatContext,
} from "@mewvis/app-sdk/chat";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import type { FilmProject } from "./model";

export type SessionRef = {
  workspaceId: string;
  chatId: string;
  profileVersion?: number;
};
const profileVersion = 3;
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
      id: "film-assistant-v3",
      introduction:
        "一起把故事变成画面。可以打磨剧本、整理素材、设计分镜，预览建议后按项采用，也可以生成分镜图片。",
      systemPrompt:
        "你是影视工坊的创作助手。依据当前项目、分集和镜头创作，保持角色和视觉风格一致。编写剧本、整理素材、设计或修改分镜时，使用本轮 runtimeInstruction 的 contextId 和 chatId 调用 film_propose_changes，提交结构化建议供用户预览采用。只填写要修改的字段，不伪造已有实体 ID，不删除内容，不直接写项目 JSON。工具成功只代表建议已提交，用户采用后才会写入；普通讨论和检查不必提交建议。用户明确要求生成媒体时，先查询 generate_media 的用途和参数，再按当前选中模型的配置执行。文件必须保存到请求指定的项目目录。以工具返回的文件和状态为准，不虚构生成成功。应用会自动关联分镜生图的结果。失败或停止后不得自行重新提交付费请求。",
      allowedToolNames: [
        "film_check_delivery",
        "film_propose_changes",
        "generate_media",
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
  workspaceId?: string,
): Promise<ApplicationChatSession> {
  const previous = await reference(key);
  if (previous) {
    if (workspaceId && previous.workspaceId !== workspaceId)
      throw new Error("助手会话与项目工作区不一致");
    // Profiles are immutable host records. Keep the old conversation in history
    // and start the updated tool profile under the same project/episode scene.
    if (previous.profileVersion !== profileVersion)
      return createSession(key, workspaceId ?? previous.workspaceId);
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
