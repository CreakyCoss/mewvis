import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/workbench/shell/layout";
import { ChatHomePage } from "@/workbench/pages/chats/home";
import { WorkspaceChatRoute } from "@/workbench/pages/chats";
import { HubPage } from "@/workbench/pages/hub";
import { KnowledgePage } from "@/workbench/pages/knowledge";
import { KnowledgeDetailPage } from "@/workbench/pages/knowledge/detail";
import { EmbeddingManagementPage } from "@/workbench/pages/knowledge/embedding";
import { ApplicationUiPage } from "@/workbench/pages/applications";
import { ApplicationManagePage } from "@/workbench/pages/applications/manage";
import { AgentsPage } from "@/workbench/pages/agents";
import { SettingsPage } from "@/workbench/pages/settings";
import { LlmSettingsPage } from "@/workbench/pages/settings/llm";
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
        <Route path="agents" element={<AgentsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/embedding" element={<EmbeddingManagementPage />} />
        <Route path="knowledge/:collectionId" element={<KnowledgeDetailPage />} />
        <Route path="apps" element={<ApplicationUiPage />} />
        <Route path="apps/manage" element={<ApplicationManagePage />} />
        <Route path="apps/:applicationId" element={<ApplicationUiPage />} />
        <Route path="extensions" element={<ExtensionsPage />} />
        <Route path="hub" element={<HubPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/llm" element={<LlmSettingsPage />} />
        <Route path="settings/sandbox" element={<SandboxSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>
);
