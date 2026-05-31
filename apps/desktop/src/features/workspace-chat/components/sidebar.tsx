import {
  Bot,
  ChevronDown,
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
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Workspace } from "@/features/workspaces/types";
import { cn } from "@/lib/utils";
import { APP_DISPLAY_NAME } from "@/product-config";
import type { ChatSessionMeta } from "../types";
import { formatSessionTime } from "../utils/sessions";

const DEFAULT_VISIBLE_SESSION_LIMIT = 5;
const WORKSPACE_VISIBLE_SESSION_LIMIT = 4;

type SidebarProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  activeSessionId: string | null;
  defaultCurrentSessionId: string | null;
  defaultCurrentSessionTitle: string;
  hasUnsavedDefaultSession: boolean;
  workspaceCurrentSessionTitle: string;
  hasUnsavedWorkspaceSession: boolean;
  isProjectsLoading: boolean;
  projectsError: string;
  isDefaultSessionsLoading: boolean;
  isWorkspaceSessionsLoading: boolean;
  defaultChatSessions: ChatSessionMeta[];
  visibleDefaultSessions: ChatSessionMeta[];
  workspaceSessionsById: Record<string, ChatSessionMeta[]>;
  showAllSessions: boolean;
  onOpenWorkspace: (workspace: Workspace) => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onStartNewSession: () => void;
  onOpenContext: () => void;
  onOpenSkills: () => void;
  onLoadDefaultSession: (sessionId: string) => void;
  onRemoveDefaultSession: (sessionId: string) => void;
  onLoadWorkspaceSession: (workspace: Workspace, sessionId: string) => void;
  onRemoveWorkspaceSession: (workspace: Workspace, sessionId: string) => void;
  onToggleShowAllSessions: () => void;
  onOpenSettings: () => void;
};

type SessionRowProps = {
  session: ChatSessionMeta;
  isActive: boolean;
  isConfirmingDelete: boolean;
  onLoad: () => void;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
};

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center justify-between px-3 pt-1">
    <span className="text-sm font-semibold text-muted-foreground">{label}</span>
  </div>
);

const EmptyState = ({ children }: { children: string }) => (
  <div className="px-3 py-2 text-sm text-muted-foreground/75">
    {children}
  </div>
);

const DraftSessionRow = ({
  title,
}: {
  title: string;
}) => (
  <div
    className={[
      "flex h-9 items-center rounded-md px-3 text-sm text-foreground transition-colors hover:bg-muted/55",
    ].join(" ")}
  >
    <span className="min-w-0 flex-1 truncate pl-6 font-semibold text-foreground">
      {title}
    </span>
    <span className="ml-2 shrink-0 text-xs font-medium text-muted-foreground">
      保存中
    </span>
  </div>
);

const SessionRow = ({
  session,
  isActive,
  isConfirmingDelete,
  onLoad,
  onRequestRemove,
  onCancelRemove,
  onRemove,
}: SessionRowProps) => {
  const deleteActionClassName = cn(
    "pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 border border-transparent text-xs opacity-0",
    "hover:bg-transparent hover:text-destructive active:!translate-y-[-50%]",
    "group-hover/session:pointer-events-auto group-hover/session:opacity-100",
    "group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100",
    isConfirmingDelete
      ? cn(
          badgeVariants({ variant: "destructive" }),
          "h-5 rounded-[5px] px-1.5 py-0 text-[11px] shadow-none hover:border-destructive/20 hover:bg-destructive/15",
        )
      : "h-7 w-7 justify-end px-0",
  );

  return (
    <div
      className={[
        "group/session flex h-9 items-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted/55 hover:text-foreground",
        "data-[active=true]:bg-muted/55 data-[active=true]:text-foreground",
      ].join(" ")}
      data-active={isActive}
      onMouseLeave={onCancelRemove}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center py-1 pr-3 pl-8 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
        onClick={onLoad}
        title={`${session.title}\n${session.path}`}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">
          {session.title}
        </span>
      </button>
      <div className="relative mr-2 flex h-full w-12 shrink-0 justify-end">
        <span className="absolute inset-y-0 right-0 flex items-center justify-end text-right text-xs tabular-nums text-muted-foreground/80 transition-opacity group-hover/session:opacity-0 group-focus-within/session:opacity-0">
          {formatSessionTime(session.updatedAt)}
        </span>
        <Button
          type="button"
          variant="ghost"
          title={isConfirmingDelete ? "确认删除对话" : "永久删除对话"}
          aria-label={isConfirmingDelete ? "确认删除对话" : "永久删除对话"}
          className={deleteActionClassName}
          onClick={(event) => {
            event.stopPropagation();
            if (isConfirmingDelete) {
              onRemove();
              return;
            }
            onRequestRemove();
          }}
        >
          {isConfirmingDelete ? (
            <span className="font-medium leading-none">确认</span>
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
};

export const Sidebar = ({
  workspace,
  workspaces,
  activeSessionId,
  defaultCurrentSessionId,
  defaultCurrentSessionTitle,
  hasUnsavedDefaultSession,
  workspaceCurrentSessionTitle,
  hasUnsavedWorkspaceSession,
  isProjectsLoading,
  projectsError,
  isDefaultSessionsLoading,
  isWorkspaceSessionsLoading,
  defaultChatSessions,
  visibleDefaultSessions,
  workspaceSessionsById,
  showAllSessions,
  onOpenWorkspace,
  onEditWorkspace,
  onStartNewSession,
  onOpenContext,
  onOpenSkills,
  onLoadDefaultSession,
  onRemoveDefaultSession,
  onLoadWorkspaceSession,
  onRemoveWorkspaceSession,
  onToggleShowAllSessions,
  onOpenSettings,
}: SidebarProps) => {
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(() => new Set());
  const [confirmingDeleteSessionId, setConfirmingDeleteSessionId] = useState<string | null>(null);
  const hiddenSessionCount = Math.max(defaultChatSessions.length - visibleDefaultSessions.length, 0);

  const toggleWorkspaceSessions = (workspaceId: string) => {
    setExpandedWorkspaceIds((current) => {
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
          placeholder="搜索"
          className="h-10 w-full rounded-xl border border-transparent bg-muted/45 pr-3 pl-9 text-sm text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42_/_0.06)] transition-colors placeholder:text-muted-foreground/55 focus:border-primary/20 focus:bg-background focus:ring-3 focus:ring-primary/15 focus:outline-none xl:h-11"
        />
      </label>
    </div>

    <div className="space-y-2 px-2.5 pb-2.5 xl:px-3 xl:pb-3">
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full justify-start rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/55"
        onClick={onStartNewSession}
      >
        <MessageSquarePlus className="size-4" />
        <span>新建对话</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full justify-start rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/55"
        title="技能广场"
        onClick={onOpenSkills}
      >
        <Wrench className="size-4" />
        <span>技能广场</span>
      </Button>
    </div>

    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-7 px-2.5 py-3 xl:px-3">
        <section className="space-y-3">
          <SectionHeader label="工作区" />
          <div className="space-y-2">
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
                const workspaceSessions = workspaceSessionsById[item.id] ?? [];
                const isExpanded = expandedWorkspaceIds.has(item.id);
                const visibleWorkspaceSessions = isExpanded
                  ? workspaceSessions
                  : workspaceSessions.slice(0, WORKSPACE_VISIBLE_SESSION_LIMIT);
                const hiddenWorkspaceSessionCount = Math.max(
                  workspaceSessions.length - visibleWorkspaceSessions.length,
                  0,
                );

                return (
                  <div key={item.id} className="space-y-2">
                    <div
                      className="group/workspace flex h-9 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
                      data-active={isActiveWorkspace}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                        onClick={() => onOpenWorkspace(item)}
                        title={item.path}
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-base font-medium">
                          {item.name}
                        </span>
                      </button>
                      {isActiveWorkspace && (
                        <div className="mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="编辑工作区"
                            aria-label="编辑工作区"
                            className="mr-0.5 size-7 hover:bg-background/55"
                            onClick={() => onEditWorkspace(item)}
                          >
                            <Pencil className="size-3 stroke-[2]" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      {isActiveWorkspace && hasUnsavedWorkspaceSession && (
                        <DraftSessionRow title={workspaceCurrentSessionTitle} />
                      )}
                      {isWorkspaceSessionsLoading && workspaceSessions.length === 0 ? (
                        <div className="py-1.5 pr-3 pl-9 text-xs text-muted-foreground">
                          正在读取工作区对话
                        </div>
                      ) : visibleWorkspaceSessions.length ? (
                        <>
                          {visibleWorkspaceSessions.map((session) => (
                            <SessionRow
                              key={session.id}
                              session={session}
                              isActive={isActiveWorkspace && session.id === activeSessionId}
                              isConfirmingDelete={confirmingDeleteSessionId === `${item.id}:${session.id}`}
                              onLoad={() => onLoadWorkspaceSession(item, session.id)}
                              onRequestRemove={() => setConfirmingDeleteSessionId(`${item.id}:${session.id}`)}
                              onCancelRemove={() => setConfirmingDeleteSessionId(null)}
                              onRemove={() => onRemoveWorkspaceSession(item, session.id)}
                            />
                          ))}
                          {workspaceSessions.length > WORKSPACE_VISIBLE_SESSION_LIMIT && (
                            <button
                              type="button"
                              className="flex h-8 w-full items-center gap-1.5 rounded-md py-1 pr-3 pl-9 text-left text-xs font-medium text-muted-foreground/75 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                              onClick={() => toggleWorkspaceSessions(item.id)}
                            >
                              <span className="min-w-0 truncate">
                                {isExpanded
                                  ? "收起较早对话"
                                  : `展开更多 ${hiddenWorkspaceSessionCount} 条`}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="size-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="size-3.5 shrink-0" />
                              )}
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="py-1 pr-3 pl-9 text-xs text-muted-foreground/70">
                          暂无工作区对话
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState>暂无工作区</EmptyState>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader label="对话" />
          <div className="space-y-2">
            {hasUnsavedDefaultSession && (
              <DraftSessionRow title={defaultCurrentSessionTitle} />
            )}
            {isDefaultSessionsLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                正在读取对话
              </div>
            ) : defaultChatSessions.length ? (
              <>
                {visibleDefaultSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    isActive={session.id === defaultCurrentSessionId}
                    isConfirmingDelete={confirmingDeleteSessionId === `default:${session.id}`}
                    onLoad={() => onLoadDefaultSession(session.id)}
                    onRequestRemove={() => setConfirmingDeleteSessionId(`default:${session.id}`)}
                    onCancelRemove={() => setConfirmingDeleteSessionId(null)}
                    onRemove={() => onRemoveDefaultSession(session.id)}
                  />
                ))}
                {defaultChatSessions.length > DEFAULT_VISIBLE_SESSION_LIMIT && (
                  <div className="pt-1">
                    <button
                      type="button"
                      className="group flex h-8 w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                      onClick={onToggleShowAllSessions}
                    >
                      <span className="min-w-0 truncate">
                        {showAllSessions
                          ? "收起较早对话"
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
              <EmptyState>暂无对话</EmptyState>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>

    <div className="space-y-1 bg-transparent p-2.5">
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-3 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
        title="中枢"
        onClick={onOpenContext}
      >
        <Bot className="size-4" />
        <span>中枢</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-full justify-start px-3 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
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
