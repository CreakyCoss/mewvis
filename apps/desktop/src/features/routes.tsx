import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "@/features/app/layout";
import { ChatHomePage } from "@/features/pages/chats/home";
import { WorkspaceChatRoute } from "@/features/pages/chats";
import { HubPage } from "@/features/pages/hub";
import { KnowledgePage } from "@/features/pages/knowledge";
import { StoriesPage } from "@/features/pages/stories";
import { AgentPage, EmbeddingPage, LlmPage, SettingsPage, WorkflowPage } from "@/features/pages/settings";
import { SkillsPage } from "@/features/pages/skills";

export const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route element={<WorkspaceChatRoute />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatHomePage />} />
        <Route path="chats/:workspaceId/:chatId" />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="hub" element={<HubPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/llm" element={<LlmPage />} />
        <Route path="settings/embedding" element={<EmbeddingPage />} />
        <Route path="settings/agent" element={<AgentPage />} />
        <Route path="settings/workflow" element={<WorkflowPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>
);
