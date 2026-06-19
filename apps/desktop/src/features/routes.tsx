import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/features/app/layout";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { ChatPage } from "@/features/pages/chat";
import { HubPage } from "@/features/pages/hub";
import { KnowledgePage } from "@/features/pages/knowledge";
import {
  AgentPage,
  LlmPage,
  SettingsPage,
  WorkflowPage,
} from "@/features/pages/settings";
import { SkillsPage } from "@/features/pages/skills";
import { TavernPage } from "@/features/pages/tavern";

const IndexRoute = () => {
  const { activeWorkspace, defaultWorkspace, overview, isLoading } =
    useWorkspaceOverview();
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
      <Route index element={<IndexRoute />} />
      <Route path="chat/:workspaceId" element={<ChatPage />} />
      <Route path="chat/:workspaceId/new" element={<ChatPage />} />
      <Route path="chat/:workspaceId/session/:sessionId" element={<ChatPage />} />
      <Route path="skills" element={<SkillsPage />} />
      <Route path="knowledge" element={<KnowledgePage />} />
      <Route path="tavern" element={<TavernPage />} />
      <Route path="tavern/:workspaceId" element={<TavernPage />} />
      <Route path="hub" element={<HubPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="settings/llm" element={<LlmPage />} />
      <Route path="settings/agent" element={<AgentPage />} />
      <Route path="settings/workflow" element={<WorkflowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);
