import { createDesktopChatService } from "@/chat/desktop";
import type { DesktopSessionInput } from "@/chat/desktop";
import { loadStoryById } from "@/features/pages/stories/storage";
import { prepareStoryChatProfile } from "@/features/pages/stories/story/actions/assistant/resources";
import { listApplications } from "@/api/applications";
import { createApplicationChatHost } from "@/chat/desktop/application";
import { listApplicationTools } from "@/api/applications/tools";
import { resolveApplicationChatWorkspace } from "./application-chat-workspace";

// Owned by the application. Resolvers return scene configuration; the service owns sessions.
export const chatService = createDesktopChatService({
  async resolveRecord(workspacePath, chatId, value): Promise<DesktopSessionInput> {
    const source = value as { workspaceId: string; origin: { kind: string; sceneId: string } };
    if (source.origin.kind === "application") return applicationChatHost.resolveSession(workspacePath, chatId, value);
    if (source.origin.kind !== "builtin") throw new Error("聊天来源不可用");
    if (source.origin.sceneId === "story-assistant") {
      const story = await loadStoryById(source.workspaceId);
      if (!story || story.workspace.path !== workspacePath) throw new Error("故事场景不可用");
      return {
        identity: { scope: `workspace:${source.workspaceId}`, id: chatId },
        workspaceId: source.workspaceId,
        workspacePath,
        origin: { kind: "builtin", sceneId: "story-assistant" },
        profile: prepareStoryChatProfile(story),
      };
    }
    throw new Error("聊天场景不可用");
  },
});

async function requireApplication(applicationId: string) {
  const applications = await listApplications();
  const application = applications.find((application) => application.id === applicationId && application.enabled);
  if (!application || application.permissionStatus !== "declared" || !application.permissions.includes("chat"))
    throw new Error("应用未启用或未获授权使用聊天");
  return application;
}
export const applicationChatHost = createApplicationChatHost(chatService, {
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
