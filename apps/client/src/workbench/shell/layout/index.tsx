import { Toaster } from "design-system/components/ui/sonner";
import { ConfigDatabaseDialog } from "@/workbench/shell/recovery";
import { AppSidebar } from "@/workbench/shell/sidebar";
import { useWorkspaceStore } from "@/workbench/pages/chats/workspace-store";
import { MainOutlet } from "./outlet";
import { ApplicationLayoutProvider } from "./application-layout";
import { AppWorkspace } from "./workspace";

export const AppLayout = () => {
  const refreshWorkspaces = useWorkspaceStore((store) => store.refreshWorkspaces);

  return (
    <ApplicationLayoutProvider>
      <AppWorkspace sidebar={<AppSidebar />}>
        <MainOutlet />
      </AppWorkspace>
      <ConfigDatabaseDialog onRecovered={refreshWorkspaces} />
      <Toaster position="top-center" />
    </ApplicationLayoutProvider>
  );
};
