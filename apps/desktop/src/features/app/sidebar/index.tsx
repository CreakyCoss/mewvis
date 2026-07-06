import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import { APP_DISPLAY_NAME } from "@/product-config";
import { PrimaryNav, UtilityNav } from "./nav";
import { SidebarSessions } from "./sessions";

export const AppSidebar = () => {
  const { overview, isLoading, error, activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const [query, setQuery] = useState("");
  const workspaces = overview?.workspaces ?? [];
  const chatWorkspace = activeWorkspace ?? defaultWorkspace ?? workspaces[0] ?? null;
  const chatPath = chatWorkspace ? `/chat/${chatWorkspace.id}/new` : "/";
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
        isDefaultWorkspace(workspace) ? "默认工作区" : "",
      ]
        .join("\n")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [query, workspaces]);

  return (
    <aside className="relative z-20 hidden w-[clamp(216px,22vw,288px)] shrink-0 flex-col bg-background/90 pt-12 text-foreground shadow-[12px_0_34px_-26px_rgb(15_23_42_/_0.32)] backdrop-blur min-[720px]:flex">
      <div className="space-y-3 px-3 pt-5 pb-3 xl:space-y-4 xl:px-4 xl:pt-6 xl:pb-4">
        <h1 className="truncate text-[1.75rem] font-bold leading-none tracking-normal text-foreground xl:text-[2rem]">
          {APP_DISPLAY_NAME}
        </h1>
        <label className="relative block">
          <span className="sr-only">搜索</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <input
            type="search"
            value={query}
            placeholder="搜索"
            className="h-10 w-full rounded-xl border border-transparent bg-muted/45 pr-3 pl-9 text-sm text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42_/_0.06)] transition-colors placeholder:text-muted-foreground/55 focus:border-primary/20 focus:bg-background focus:ring-3 focus:ring-primary/15 focus:outline-none xl:h-11"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <PrimaryNav chatPath={chatPath} />
      <SidebarSessions workspaces={filteredWorkspaces} isLoading={isLoading} error={error} />
      <UtilityNav />
    </aside>
  );
};
