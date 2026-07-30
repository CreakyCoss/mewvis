import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/features/app/layout";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { ChatPage } from "@/features/pages/chat";
import { ChatHomePage } from "@/features/pages/chats/home";
import { WorkspaceChatRoute } from "@/features/pages/chats";
import { HubPage } from "@/features/pages/hub";
import { KnowledgePage } from "@/features/pages/knowledge";
import { StoriesPage } from "@/features/pages/stories";
import { AgentPage, LlmPage, SettingsPage, WorkflowPage } from "@/features/pages/settings";
import { SkillsPage } from "@/features/pages/skills";

const IndexRoute = () => {
  const { activeWorkspace, defaultWorkspace, overview, isLoading } = useWorkspaceOverview();
  const workspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;

  if (!workspace && isLoading) {
    return null;
  }

  if (!workspace) {
    return null;
  }

  return <Navigate to={`/chat/${workspace.id}/new`} replace />;
};

export const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route element={<WorkspaceChatRoute />}>
        <Route index element={<IndexRoute />} />
        <Route path="chat/:workspaceId" element={<ChatPage />} />
        <Route path="chat/:workspaceId/new" element={<ChatPage />} />
        <Route path="chat/:workspaceId/session/:sessionId" element={<ChatPage />} />
        <Route path="chat-next" element={<ChatHomePage />} />
        <Route path="chats/:workspaceId/:chatId" />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="hub" element={<HubPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/llm" element={<LlmPage />} />
        <Route path="settings/agent" element={<AgentPage />} />
        <Route path="settings/workflow" element={<WorkflowPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>
);
