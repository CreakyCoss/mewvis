import { Toaster } from "@/components/ui/sonner";
import { WindowDragRegion } from "@/components/window-drag-region";
import { ConfigDatabaseDialog } from "@/features/app/recovery";
import { AppSidebar } from "@/features/app/sidebar";
import { useWorkspaceStore } from "@/features/pages/chats/workspace-store";
import { MainOutlet } from "./outlet";

export const AppLayout = () => {
  const refreshWorkspaces = useWorkspaceStore((store) => store.refreshWorkspaces);

  return (
    <>
      <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
        <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
        <AppSidebar />
        <MainOutlet />
      </main>
      <ConfigDatabaseDialog onRecovered={refreshWorkspaces} />
      <Toaster position="top-center" />
    </>
  );
};
