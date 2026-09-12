import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/features/shell/layout";
import { ChatHomePage } from "@/features/pages/chats/home";
import { WorkspaceChatRoute } from "@/features/pages/chats";
import { HubPage } from "@/features/pages/hub";
import { KnowledgePage } from "@/features/pages/knowledge";
import { ApplicationUiPage } from "@/features/pages/applications";
import { ApplicationManagePage } from "@/features/pages/applications/manage";
import { StoriesPage } from "@/features/pages/stories";
import { AgentPage, EmbeddingPage, LlmPage, SettingsPage, WorkflowPage } from "@/features/pages/settings";
import { SkillsPage } from "@/features/pages/skills";
import { SandboxSettingsPage } from "@/features/pages/settings/sandbox";

export const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route element={<WorkspaceChatRoute />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatHomePage />} />
        <Route path="chats/:workspaceId/:chatId" />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/:collectionId" element={<KnowledgePage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="apps" element={<ApplicationUiPage />} />
        <Route path="apps/manage" element={<ApplicationManagePage />} />
        <Route path="apps/:applicationId" element={<ApplicationUiPage />} />
        <Route path="hub" element={<HubPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/llm" element={<LlmPage />} />
        <Route path="settings/embedding" element={<EmbeddingPage />} />
        <Route path="settings/agent" element={<AgentPage />} />
        <Route path="settings/workflow" element={<WorkflowPage />} />
        <Route path="settings/sandbox" element={<SandboxSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>
);
