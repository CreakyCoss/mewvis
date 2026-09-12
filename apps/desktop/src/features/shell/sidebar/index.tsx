import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/features/pages/chats/workspace-store";
import { APP_DISPLAY_NAME } from "@/product-config";
import { PrimaryNav, UtilityNav } from "./nav";
import { SidebarChats } from "./chats";

export const AppSidebar = () => {
  const workspaceStore = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const workspaces = workspaceStore.workspaces;
  const filteredWorkspaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return workspaces;
    }

    return workspaces.filter((workspace) => {
      const searchable = [
        workspace.name,
        workspace.path,
        workspace.description ?? "",
        workspace.isDefault ? "默认工作区" : "",
      ]
        .join("\n")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [query, workspaces]);

  return (
    <aside className="relative z-20 hidden w-[clamp(216px,22vw,288px)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-12 text-sidebar-foreground min-[720px]:flex">
      <div className="space-y-4 px-3.5 pt-5 pb-3 xl:px-4 xl:pt-6">
        <h1 className="app-brand truncate px-0.5 text-xl font-bold leading-6 tracking-[-0.03em]">{APP_DISPLAY_NAME}</h1>
        <label className="relative block">
          <span className="sr-only">搜索</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/75" />
          <input
            type="search"
            value={query}
            placeholder="搜索"
            className="h-9 w-full rounded-lg border border-sidebar-border bg-card pr-3 pl-9 text-sm text-sidebar-foreground shadow-xs transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground/65 hover:border-sidebar-ring/35 focus:border-sidebar-ring/60 focus:ring-3 focus:ring-sidebar-ring/15 focus:outline-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <PrimaryNav />
      <SidebarChats workspaces={filteredWorkspaces} isLoading={workspaceStore.isLoading} error={workspaceStore.error} />
      <UtilityNav />
    </aside>
  );
};
