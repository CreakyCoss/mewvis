import { Toaster } from "@/components/ui/sonner";
import { ConfigDatabaseDialog } from "@/features/app/recovery";
import { AppSidebar } from "@/features/app/sidebar";
import { useWorkspaceStore } from "@/features/pages/chats/workspace-store";
import { MainOutlet } from "./outlet";
import { PluginLayoutProvider } from "./plugin-layout";
import { AppWorkspace } from "./workspace";

export const AppLayout = () => {
  const refreshWorkspaces = useWorkspaceStore((store) => store.refreshWorkspaces);

  return (
    <PluginLayoutProvider>
      <AppWorkspace sidebar={<AppSidebar />}>
        <MainOutlet />
      </AppWorkspace>
      <ConfigDatabaseDialog onRecovered={refreshWorkspaces} />
      <Toaster position="top-center" />
    </PluginLayoutProvider>
  );
};
