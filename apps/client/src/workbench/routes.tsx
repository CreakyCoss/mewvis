import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/workbench/shell/layout";
import { ChatHomePage } from "@/workbench/pages/chats/home";
import { WorkspaceChatRoute } from "@/workbench/pages/chats";
import { HubPage } from "@/workbench/pages/hub";
import { KnowledgePage } from "@/workbench/pages/knowledge";
import { ApplicationUiPage } from "@/workbench/pages/applications";
import { ApplicationManagePage } from "@/workbench/pages/applications/manage";
import { AgentPage, EmbeddingPage, LlmPage, SettingsPage, WorkflowPage } from "@/workbench/pages/settings";
import { SkillsPage } from "@/workbench/pages/skills";
import { SandboxSettingsPage } from "@/workbench/pages/settings/sandbox";
import { ExtensionsPage } from "@/workbench/pages/extensions";

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
        <Route path="apps" element={<ApplicationUiPage />} />
        <Route path="apps/manage" element={<ApplicationManagePage />} />
        <Route path="apps/:applicationId" element={<ApplicationUiPage />} />
        <Route path="extensions" element={<ExtensionsPage />} />
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
