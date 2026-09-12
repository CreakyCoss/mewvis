import { Toaster } from "@/components/ui/sonner";
import { ConfigDatabaseDialog } from "@/features/shell/recovery";
import { AppSidebar } from "@/features/shell/sidebar";
import { useWorkspaceStore } from "@/features/pages/chats/workspace-store";
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
