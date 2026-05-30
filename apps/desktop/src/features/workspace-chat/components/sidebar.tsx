import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder,
  MessageSquarePlus,
  Pencil,
  Search,
  Settings,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Workspace } from "@/features/workspaces/types";
import type { ChatSessionMeta } from "../types";
import { formatSessionTime } from "../utils/sessions";

type SidebarProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  currentSessionId: string | null;
  currentSessionTitle: string;
  hasUnsavedSession: boolean;
  isProjectsLoading: boolean;
  projectsError: string;
  isSessionsLoading: boolean;
  chatSessions: ChatSessionMeta[];
  visibleSessions: ChatSessionMeta[];
  showAllSessions: boolean;
  onOpenWorkspace: (workspace: Workspace) => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onStartNewSession: () => void;
  onOpenContext: () => void;
  onOpenSkills: () => void;
  onLoadSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  onToggleShowAllSessions: () => void;
  onOpenSettings: () => void;
};

export const Sidebar = ({
  workspace,
  workspaces,
  currentSessionId,
  currentSessionTitle,
  hasUnsavedSession,
  isProjectsLoading,
  projectsError,
  isSessionsLoading,
  chatSessions,
  visibleSessions,
  showAllSessions,
  onOpenWorkspace,
  onEditWorkspace,
  onStartNewSession,
  onOpenContext,
  onOpenSkills,
  onLoadSession,
  onRemoveSession,
  onToggleShowAllSessions,
  onOpenSettings,
}: SidebarProps) => {
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(() => new Set());

  const toggleWorkspaceCollapsed = (workspaceId: string) => {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  return (
  <aside className="relative z-20 hidden w-[288px] shrink-0 flex-col bg-background/90 pt-12 text-foreground shadow-[12px_0_34px_-26px_rgb(15_23_42_/_0.32)] backdrop-blur md:flex">
    <div className="space-y-4 px-4 pt-6 pb-4">
      <h1 className="truncate text-[2rem] font-bold leading-none tracking-normal text-foreground">
        Mewvis
      </h1>
      <label className="relative block">
        <span className="sr-only">搜索</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          type="search"
          placeholder="搜索"
          className="h-11 w-full rounded-xl border border-transparent bg-muted/45 pr-3 pl-9 text-sm text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42_/_0.06)] transition-colors placeholder:text-muted-foreground/55 focus:border-primary/20 focus:bg-background focus:ring-3 focus:ring-primary/15 focus:outline-none"
        />
      </label>
    </div>

    <div className="space-y-2 px-3 pb-3">
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full justify-start rounded-xl px-3 text-sm font-medium text-foreground hover:bg-muted/55"
        onClick={onStartNewSession}
      >
        <MessageSquarePlus className="size-4" />
        <span>新建对话</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full justify-start rounded-xl px-3 text-sm font-medium text-foreground hover:bg-muted/55"
        title="技能广场"
        onClick={onOpenSkills}
      >
        <Wrench className="size-4" />
        <span>技能广场</span>
      </Button>
    </div>

    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 px-3 py-3">
        <section className="space-y-3">
          <div className="px-1 text-sm font-medium text-muted-foreground">
            <span>工作区</span>
          </div>
          <div className="space-y-5">
            {projectsError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {projectsError}
              </div>
            )}
            {isProjectsLoading ? (
              <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                正在读取工作区
              </div>
            ) : workspaces.length ? (
              workspaces.map((item) => {
                const isActiveWorkspace = item.id === workspace.id;
                const isCollapsed = collapsedWorkspaceIds.has(item.id);
                const hiddenSessionCount = Math.max(chatSessions.length - visibleSessions.length, 0);

                return (
                <div key={item.id} className="space-y-1.5">
                  <div
                    className="group/project flex h-8 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground data-[active=true]:text-foreground"
                    data-active={isActiveWorkspace}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                      onClick={() => onOpenWorkspace(item)}
                      title={item.path}
                    >
                      <Folder className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-base font-medium">
                        {item.name}
                      </span>
                    </button>
                    {isActiveWorkspace && (
                      <div className="mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/project:opacity-100 group-focus-within/project:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title={isCollapsed ? "展开聊天记录" : "折叠聊天记录"}
                          aria-label={isCollapsed ? "展开聊天记录" : "折叠聊天记录"}
                          className="size-7 hover:bg-background/70"
                          onClick={() => toggleWorkspaceCollapsed(item.id)}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="size-4 stroke-[2.25]" />
                          ) : (
                            <ChevronDown className="size-4 stroke-[2.25]" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="编辑工作区"
                          aria-label="编辑工作区"
                          className="size-7 hover:bg-background/70"
                          onClick={() => onEditWorkspace(item)}
                        >
                          <Pencil className="size-3 stroke-[2]" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isActiveWorkspace && !isCollapsed && (
                    <div className="space-y-1">
                      {hasUnsavedSession && (
                        <div className="mx-1 flex h-9 items-center rounded-md bg-muted/70 px-8 text-sm shadow-xs">
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {currentSessionTitle}
                          </span>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                            保存中
                          </span>
                        </div>
                      )}
                      {isSessionsLoading ? (
                        <div className="px-8 py-3 text-sm text-muted-foreground">
                          正在读取聊天记录
                        </div>
                      ) : chatSessions.length ? (
                        <>
                          {visibleSessions.map((session) => (
                            <div
                              key={session.id}
                              className="group/session relative flex h-9 items-center rounded-md transition-colors hover:bg-muted/55 data-[active=true]:bg-muted/70 data-[active=true]:shadow-xs"
                              data-active={session.id === currentSessionId}
                            >
                              <button
                                type="button"
                                className="min-w-0 flex-1 py-1 pl-8 pr-2 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                                onClick={() => onLoadSession(session.id)}
                                title={session.title}
                              >
                                <div className="truncate text-sm font-semibold leading-5 text-foreground">
                                  {session.title}
                                </div>
                              </button>
                              <span className="mr-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                                {formatSessionTime(session.updatedAt)}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title="永久删除聊天"
                                className="mr-1 size-7 opacity-0 hover:text-destructive group-hover/session:opacity-100 group-data-[active=true]/session:opacity-80"
                                onClick={() => onRemoveSession(session.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                          {chatSessions.length > 5 && (
                            <div className="pt-1">
                              <button
                                type="button"
                                className="group flex h-7 w-full items-center gap-1.5 rounded-md py-1 pl-8 pr-2 text-left text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                                onClick={onToggleShowAllSessions}
                              >
                                <span className="min-w-0 truncate">
                                  {showAllSessions
                                    ? "收起较早会话"
                                    : `展开更多 ${hiddenSessionCount} 条`}
                                </span>
                                {showAllSessions ? (
                                  <ChevronUp className="size-3.5 shrink-0 text-muted-foreground/55 group-hover:text-foreground" />
                                ) : (
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/55 group-hover:text-foreground" />
                                )}
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="px-8 py-3 text-sm text-muted-foreground">
                          暂无聊天记录
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })
            ) : (
              <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                暂无工作区
              </div>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>

    <div className="space-y-1 bg-transparent p-3">
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
        title="中枢"
        onClick={onOpenContext}
      >
        <Bot className="size-4" />
        <span>中枢</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
        title="设置"
        onClick={onOpenSettings}
      >
        <Settings className="size-4" />
        <span>设置</span>
      </Button>
    </div>
  </aside>
  );
};
