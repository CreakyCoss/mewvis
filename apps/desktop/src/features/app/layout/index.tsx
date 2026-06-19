import { Toaster } from "@/components/ui/sonner";
import { WindowDragRegion } from "@/components/window-drag-region";
import { ConfigDatabaseDialog } from "@/features/app/recovery";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { AppSidebar } from "@/features/app/sidebar";
import { MainOutlet } from "./outlet";

export const AppLayout = () => {
  const { loadOverview } = useWorkspaceOverview();

  return (
    <>
      <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
        <WindowDragRegion className="fixed inset-x-0 top-0 z-40 h-10" />
        <AppSidebar />
        <MainOutlet />
      </main>
      <ConfigDatabaseDialog onRecovered={loadOverview} />
      <Toaster position="top-center" />
    </>
  );
};
