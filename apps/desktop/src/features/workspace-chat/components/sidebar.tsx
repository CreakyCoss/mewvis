import { Folder, Plus, Plug, RefreshCw, Search, Settings, Trash2 } from "lucide-react";
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
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onStartNewSession: () => void;
  onOpenSkills: () => void;
  onRefreshConfig: () => void;
  onRefreshProjects: () => void;
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
  onCreateWorkspace,
  onEditWorkspace,
  onStartNewSession,
  onOpenSkills,
  onRefreshConfig,
  onRefreshProjects,
  onLoadSession,
  onRemoveSession,
  onToggleShowAllSessions,
  onOpenSettings,
}: SidebarProps) => (
  <aside className="hidden w-[288px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
    <div className="border-b border-sidebar-border px-4 py-4">
      <h1 className="truncate text-sm font-semibold">Novel Claw</h1>
    </div>

    <div className="space-y-1 border-b border-sidebar-border p-3">
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2"
        onClick={onStartNewSession}
      >
        <Plus className="size-4" />
        <span>新对话</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2"
        title="搜索"
      >
        <Search className="size-4" />
        <span>搜索</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2"
        title="工作区 Skills"
        onClick={onOpenSkills}
      >
        <Plug className="size-4" />
        <span>插件</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2"
        title="刷新 LLM 与 Agent 配置"
        onClick={onRefreshConfig}
      >
        <RefreshCw className="size-4" />
        <span>刷新配置</span>
      </Button>
    </div>

    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 px-3 py-3">
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1 text-sm font-medium text-muted-foreground">
            <span>项目</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="新增工作区"
                className="size-6"
                onClick={onCreateWorkspace}
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="刷新项目"
                disabled={isProjectsLoading}
                className="size-6"
                onClick={onRefreshProjects}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-5">
            {projectsError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {projectsError}
              </div>
            )}
            {isProjectsLoading ? (
              <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                正在读取项目
              </div>
            ) : workspaces.length ? (
              workspaces.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div
                    className="group/project flex h-8 items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:text-sidebar-foreground"
                    data-active={item.id === workspace.id}
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
                    {item.id === workspace.id && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="工作区设置"
                        className="mr-1 size-7 opacity-0 group-hover/project:opacity-100 group-data-[active=true]/project:opacity-80"
                        onClick={() => onEditWorkspace(item)}
                      >
                        <Settings className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  {item.id === workspace.id && (
                    <div className="space-y-1">
                      {hasUnsavedSession && (
                        <div className="mx-1 flex h-9 items-center rounded-md bg-sidebar-accent px-8 text-sm">
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
                              className="group/session relative flex h-9 items-center rounded-md transition-colors hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
                              data-active={session.id === currentSessionId}
                            >
                              <button
                                type="button"
                                className="min-w-0 flex-1 py-1 pl-8 pr-2 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                                onClick={() => onLoadSession(session.id)}
                                title={session.title}
                              >
                                <div className="truncate text-sm font-semibold leading-5 text-sidebar-foreground">
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
                            <button
                              type="button"
                              className="h-8 px-8 text-left text-sm font-medium text-muted-foreground hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                              onClick={onToggleShowAllSessions}
                            >
                              {showAllSessions ? "收起显示" : "展开显示"}
                            </button>
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
              ))
            ) : (
              <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                暂无项目
              </div>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>

    <div className="border-t border-sidebar-border p-3">
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-2"
        title="设置"
        onClick={onOpenSettings}
      >
        <Settings className="size-4" />
        <span>设置</span>
      </Button>
    </div>
  </aside>
);
