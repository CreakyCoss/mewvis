import { getLlmModelOptions } from "@/api/llm";
import { deleteChat } from "@/api/chat";
import { createDesktopChatService } from "@/chat/desktop";
import type { DesktopSessionInput } from "@/chat/desktop";
import { listApplications, type ApplicationPermission } from "@/api/applications";
import { createApplicationChatHost } from "@/chat/desktop/application";
import { listApplicationTools } from "@/api/applications/tools";
import { createApplicationDataClient, ApplicationDataError } from "@mewvis/app-sdk/data";
import { createBackendApplicationDataTransport } from "@/api/applications/data";

// Owned by the application. Resolvers return scene configuration; the service owns sessions.
export const chatService = createDesktopChatService({
  async resolveRecord(workspacePath, chatId, value): Promise<DesktopSessionInput> {
    const source = value as { workspaceId: string; origin: { kind: string; sceneId: string } };
    if (source.origin.kind === "application") return applicationChatHost.resolveSession(workspacePath, chatId, value);
    if (source.origin.kind !== "builtin") throw new Error("聊天来源不可用");
    throw new Error("聊天场景不可用");
  },
});

/** Resolve a directory for Chat without enrolling it in the desktop workspace registry. */
async function resolveApplicationChatWorkspace(
  application: { id: string; permissions: ApplicationPermission[] },
  workspaceId: string,
): Promise<string> {
  if (!application.permissions.includes("application-workspaces")) {
    throw new ApplicationDataError("PERMISSION_DENIED", "应用未声明 application-workspaces 权限");
  }
  const transport = createBackendApplicationDataTransport(application.id);
  try {
    return (await createApplicationDataClient(transport).workspaces.get(workspaceId)).path;
  } finally {
    transport.dispose();
  }
}

async function requireApplication(applicationId: string) {
  const applications = await listApplications();
  const application = applications.find((application) => application.id === applicationId && application.enabled);
  if (!application || application.permissionStatus !== "declared" || !application.permissions.includes("chat"))
    throw new Error("应用未启用或未获授权使用聊天");
  return application;
}
export const applicationChatHost = createApplicationChatHost(chatService, {
  async models(applicationId) {
    await requireApplication(applicationId);
    return (await getLlmModelOptions()).map(({ id, provider, modelId, modelName }) => ({
      id,
      provider,
      modelId,
      modelName,
    }));
  },
  deleteRecord: deleteChat,
  async toolCatalog(applicationId) {
    await requireApplication(applicationId);
    return listApplicationTools(applicationId);
  },
  async authorize(applicationId, workspaceId) {
    const application = await requireApplication(applicationId);
    const workspacePath = await resolveApplicationChatWorkspace(application, workspaceId);
    return { workspacePath, knowledge: application.permissions.includes("chat-knowledge") };
  },
});
