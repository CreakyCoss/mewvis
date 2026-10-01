import { getApplicationHost } from "@isle/app-sdk/browser";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import {
  AUTHORING_TOOLS,
  type BuildArtifact,
  type BuildResult,
  type ProjectDetail,
  type ProjectSummary,
  type SourceFile,
} from "./contracts";

export async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return (await getApplicationHost().executeTool<T>(name, args)).value;
}
export const api = {
  list: async () =>
    (await call<{ projects: ProjectSummary[] }>("workshop_list_projects"))
      .projects,
  create: async (name: string, description: string) =>
    (
      await call<{ project: ProjectDetail }>("workshop_create_project", {
        name,
        description,
      })
    ).project,
  project: async (workspaceId: string) =>
    (
      await call<{ project: ProjectDetail }>("workshop_read_project", {
        workspaceId,
      })
    ).project,
  file: async (workspaceId: string, path: string) =>
    (
      await call<{ file: SourceFile }>("workshop_read_file", {
        workspaceId,
        path,
      })
    ).file,
  write: async (
    workspaceId: string,
    path: string,
    content: string,
    baseRevision: number,
  ) =>
    (
      await call<{ project: ProjectDetail }>("workshop_write_file", {
        workspaceId,
        path,
        content,
        baseRevision,
      })
    ).project,
  deleteFile: async (workspaceId: string, path: string, baseRevision: number) =>
    (
      await call<{ project: ProjectDetail }>("workshop_delete_file", {
        workspaceId,
        path,
        baseRevision,
      })
    ).project,
  build: (workspaceId: string) =>
    call<BuildResult>("workshop_build", { workspaceId }),
  artifact: async (workspaceId: string, mode: "draft" | "saved") =>
    (
      await call<{ artifact: BuildArtifact | null }>("workshop_read_build", {
        workspaceId,
        mode,
      })
    ).artifact,
  save: async (workspaceId: string) =>
    (
      await call<{ project: ProjectDetail }>("workshop_save_version", {
        workspaceId,
      })
    ).project,
  restore: async (
    workspaceId: string,
    versionId: string,
    baseRevision: number,
  ) =>
    (
      await call<{ project: ProjectDetail }>("workshop_restore_version", {
        workspaceId,
        versionId,
        baseRevision,
      })
    ).project,
  remove: (workspaceId: string) =>
    call("workshop_remove_project", { workspaceId }),
};

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export const projectContext = (project: ProjectDetail) =>
  JSON.stringify({
    projectId: project.id,
    workspaceId: project.id,
    name: project.name,
    description: project.description,
    revision: project.revision,
    files: project.files,
  });
const sessions = new Map<string, Promise<ApplicationChatSession>>();
export function developerSession(
  project: ProjectDetail,
): Promise<ApplicationChatSession> {
  const existing = sessions.get(project.id);
  if (existing) return existing;
  const pending = (async () => {
    const client = getApplicationChatClient();
    const chats = (await client.listSessions({ workspaceId: project.id }))
      .filter((chat) => chat.sceneId === "workshop-developer")
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (chats[0])
      return client.openSession({
        workspaceId: project.id,
        chatId: chats[0].chatId,
      });
    // Invoked only by the user's explicit create/open-editor action.
    const session = await client.createSession({
      workspaceId: project.id,
      sceneId: "workshop-developer",
      profile: {
        id: "workshop-developer-v1",
        introduction:
          "描述你想做的小应用，我会读取项目、修改代码并构建预览。运行版本由你点击「保存版本」保存。",
        systemPrompt: `你是应用工坊的开发助手。只开发当前项目中的浏览器小应用。先调用 workshop_read_project 与 workshop_read_file，使用返回的最新 revision 作为写入的 baseRevision；每次写入后用返回的新 revision 继续。完成后调用 workshop_build，根据 diagnostics 修复。入口 main.tsx，支持 React、react/jsx-runtime、react-dom/client、@isle/app-sdk/views 和项目内 JS/TS/TSX/CSS；不支持安装依赖、命令、外部资源或网络。小应用可通过 getApplicationViewClient().request('state.read',{key:'state'})、request('state.write',{key:'state',value:JSON值}) 保存状态。状态接口是异步的。使用公共 CSS 主题令牌。不要执行生成代码，不要修改宿主，不自动保存运行版本。用户的需求可能是任意浏览器工具，不局限于计时器。`,
        context: { requestContext: projectContext(project) },
        allowedToolNames: AUTHORING_TOOLS,
        skills: [],
      },
    });
    const saved = await session.flush();
    if (!saved.ok) throw new Error(saved.error);
    return session;
  })();
  sessions.set(project.id, pending);
  pending.catch(() => {
    if (sessions.get(project.id) === pending) sessions.delete(project.id);
  });
  return pending;
}

export async function closeProjectSessions(projectId: string) {
  const client = getApplicationChatClient();
  const cached = sessions.get(projectId);
  const values = new Map<string, ApplicationChatSession>();
  if (cached) {
    const session = await cached;
    values.set(session.identity.id, session);
  }
  for (const chat of await client.listSessions({ workspaceId: projectId })) {
    if (chat.sceneId === "workshop-developer" && !values.has(chat.chatId))
      values.set(
        chat.chatId,
        await client.openSession({
          workspaceId: projectId,
          chatId: chat.chatId,
        }),
      );
  }
  for (const session of values.values()) {
    const result = await session.close();
    if (!result.ok) throw new Error(result.error);
  }
  sessions.delete(projectId);
}
