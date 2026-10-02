import { getApplicationHost } from "@mewvis/app-sdk/browser";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@mewvis/app-sdk/chat";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
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
  createVersion: async (workspaceId: string) =>
    (
      await call<{ project: ProjectDetail }>("workshop_create_version", {
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
    sourceRoot: project.sourceRoot,
    entry: project.entry,
    pathConvention:
      "源码工具的 path 相对于 source/，例如 src/App.tsx；不包含 source/ 前缀，不访问 .workshop 或宿主会话目录。",
    files: project.files,
  });
const sessions = new Map<string, Promise<ApplicationChatSession>>();
const projectSessions = new Map<string, Map<string, ApplicationChatSession>>();
export type DeveloperSessionOptions = { fresh?: boolean; chatId?: string };
const developerSessionKey = (projectId: string) => `workshop:chat:${projectId}`;
export async function listDeveloperSessions(projectId: string) {
  return (
    await getApplicationChatClient().listSessions({ workspaceId: projectId })
  )
    .filter((chat) => chat.sceneId === "workshop-developer")
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}
export function developerSession(
  project: ProjectDetail,
  options: DeveloperSessionOptions = {},
): Promise<ApplicationChatSession> {
  const existing = sessions.get(project.id);
  if (existing && !options.fresh && !options.chatId) return existing;
  const pending = (async () => {
    const client = getApplicationChatClient();
    const storage = getApplicationDataClient().storage;
    let chatId = options.chatId;
    if (!options.fresh) {
      const chats = await listDeveloperSessions(project.id);
      if (chatId && !chats.some((chat) => chat.chatId === chatId))
        throw new Error("这段会话已不在当前小应用的历史记录中。");
      if (!chatId) {
        const selected = await storage.getItem<string>(
          developerSessionKey(project.id),
        );
        chatId =
          chats.find((chat) => chat.chatId === selected)?.chatId ??
          chats[0]?.chatId;
      }
    }
    const session = chatId
      ? await client.openSession({
          workspaceId: project.id,
          chatId,
        })
      : // Invoked only by the user's explicit create/open-editor action.
        await client.createSession({
          workspaceId: project.id,
          sceneId: "workshop-developer",
          profile: {
            id: "workshop-developer-v2",
            introduction:
              "告诉我你想做什么，我会帮你生成应用。你可以在应用预览中直接试用，继续描述需要调整的地方；满意后点击「保存版本」。",
            systemPrompt: `你是应用工坊的 AI 应用创作助手。用用户能理解的语言确认需求和说明结果，围绕生成应用、直接试用和继续调整交流，不主动输出源码或开发步骤。只开发当前项目中的浏览器小应用。先调用 workshop_read_project 与 workshop_read_file，使用返回的最新 revision 作为写入的 baseRevision；每次写入后用返回的新 revision 继续。完成后调用 workshop_build，根据 diagnostics 修复。所有源码工具路径都相对于 source/，例如 src/App.tsx；入口为 src/main.tsx，package.json 和 tsconfig.json 也是源码文件。禁止访问 .workshop 和宿主会话目录。支持 React、react/jsx-runtime、react-dom/client、@mewvis/app-sdk/views 和项目内 JS/TS/TSX/CSS/JSON；不支持安装依赖、命令、外部资源或网络。小应用可通过 getApplicationViewClient().request('state.read',{key:'state'})、request('state.write',{key:'state',value:JSON值}) 保存状态。状态接口是异步的。使用公共 CSS 主题令牌。不要执行生成代码，不要修改宿主，不自动保存运行版本。用户的需求可能是任意浏览器工具，不局限于计时器。`,
            context: { requestContext: projectContext(project) },
            allowedToolNames: AUTHORING_TOOLS,
            skills: [],
          },
        });
    const opened = projectSessions.get(project.id) ?? new Map();
    opened.set(session.identity.id, session);
    projectSessions.set(project.id, opened);
    const saved = await session.flush();
    if (!saved.ok) throw new Error(saved.error);
    await storage.setItem(developerSessionKey(project.id), session.identity.id);
    return session;
  })();
  sessions.set(project.id, pending);
  pending.catch(() => {
    if (sessions.get(project.id) === pending) {
      if (existing) sessions.set(project.id, existing);
      else sessions.delete(project.id);
    }
  });
  return pending;
}

export async function closeProjectSessions(projectId: string) {
  const client = getApplicationChatClient();
  const cached = sessions.get(projectId);
  const values = new Map(projectSessions.get(projectId));
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
  projectSessions.delete(projectId);
}
