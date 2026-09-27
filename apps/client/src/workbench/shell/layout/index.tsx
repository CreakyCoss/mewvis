import { Toaster } from "design-system/components/ui/sonner";
import { useMatch } from "react-router";
import { ConfigDatabaseDialog } from "@/workbench/shell/recovery";
import { AppSidebar } from "@/workbench/shell/sidebar";
import { ChatSidebar } from "@/workbench/shell/sidebar/chats";
import { useWorkspaceStore } from "@/workbench/pages/chats/workspace-store";
import { MainOutlet } from "./outlet";
import { AppWorkspace } from "./workspace";

export const AppLayout = () => {
  const refreshWorkspaces = useWorkspaceStore((store) => store.refreshWorkspaces);
  const chatHome = useMatch("/chat");
  const chat = useMatch("/chats/:workspaceId/:chatId");

  return (
    <>
      <AppWorkspace sidebar={<AppSidebar />} contextualSidebar={chatHome || chat ? <ChatSidebar /> : null}>
        <MainOutlet />
      </AppWorkspace>
      <ConfigDatabaseDialog onRecovered={refreshWorkspaces} />
      <Toaster position="top-center" />
    </>
  );
};
