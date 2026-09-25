import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "design-system/lib/utils";
import { useWorkspaceStore } from "@/workbench/pages/chats/workspace-store";
import { APP_DISPLAY_NAME } from "@/product-config";
import { PrimaryNav, UtilityNav } from "./nav";
import { SidebarChats } from "./chats";

export const AppSidebar = () => {
  const workspaceStore = useWorkspaceStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative z-20 hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-12 text-sidebar-foreground min-[720px]:flex",
        collapsed ? "w-14" : "w-[clamp(216px,22vw,288px)]",
      )}
    >
      <div className={cn("relative h-11 shrink-0 pt-2 pb-3", collapsed ? "px-2" : "px-3.5 xl:px-4")}>
        {!collapsed && (
          <h1 className="app-brand truncate px-0.5 pr-10 text-xl font-bold leading-6 tracking-[-0.03em]">
            {APP_DISPLAY_NAME}
          </h1>
        )}
        <button
          type="button"
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={() => setCollapsed((current) => !current)}
          className={cn(
            "absolute top-0.5 flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
            collapsed ? "left-1/2 -translate-x-1/2" : "right-2",
          )}
          aria-pressed={!collapsed}
        >
          {collapsed ? <PanelRightIcon className="size-4" /> : <PanelLeftIcon className="size-4" />}
        </button>
      </div>

      <PrimaryNav collapsed={collapsed} />
      <SidebarChats
        collapsed={collapsed}
        workspaces={workspaceStore.workspaces}
        isLoading={workspaceStore.isLoading}
        error={workspaceStore.error}
      />
      <UtilityNav collapsed={collapsed} />
    </aside>
  );
};
