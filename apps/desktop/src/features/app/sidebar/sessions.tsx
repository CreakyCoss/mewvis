import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { chatSessionKey, useChatSessionsStore } from "@/features/pages/chat/session-store";
import type { ChatSessionMeta } from "@/features/pages/chat/types";
import { formatSessionTime } from "@/features/pages/chat/utils/sessions";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";

const DEFAULT_VISIBLE_SESSION_LIMIT = 5;
const WORKSPACE_VISIBLE_SESSION_LIMIT = 4;

type SessionsProps = {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string;
};

type SessionRowProps = {
  to: string;
  workspace: Workspace;
  session: ChatSessionMeta;
  isDeleting: boolean;
  isRunning: boolean;
  onConfirmDelete: (workspace: Workspace, session: ChatSessionMeta) => Promise<void>;
};

type WorkspaceActionsProps = {
  workspace: Workspace;
  isDeleting: boolean;
  onEdit: (workspace: Workspace) => void;
  onRequestDelete: (workspace: Workspace) => void;
};

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center justify-between px-3 pt-1">
    <span className="text-sm font-semibold text-muted-foreground">{label}</span>
  </div>
);

const EmptyState = ({ children }: { children: string }) => (
  <div className="px-3 py-2 text-sm text-muted-foreground/75">{children}</div>
);

const SessionRow = ({ to, workspace, session, isDeleting, isRunning, onConfirmDelete }: SessionRowProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <div
      className="group/session relative min-w-0"
      onMouseLeave={() => {
        if (!isDeleting) {
          setIsConfirmingDelete(false);
        }
      }}
    >
      <NavLink
        to={to}
        title={`${session.title}\n${session.path}`}
        className={({ isActive }) =>
          cn(
            "flex h-9 min-w-0 items-center overflow-hidden rounded-md py-1 pr-3 pl-8 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground group-hover/session:bg-muted/55 group-hover/session:text-foreground",
            isActive && "bg-muted/55 text-foreground",
          )
        }
      >
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
        <span className="ml-2 flex h-7 w-12 shrink-0 items-center justify-end whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground/80 group-hover/session:opacity-0 group-focus-within/session:opacity-0">
          {isRunning ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-label="处理中" />
          ) : session.isUnread ? (
            <span className="mt-1 block size-2 rounded-full bg-primary" aria-label="未读消息" />
          ) : (
            formatSessionTime(session.updatedAt)
          )}
        </span>
      </NavLink>
      <button
        type="button"
        className={cn(
          "absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:bg-background/75 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/25 group-hover/session:opacity-100 focus-visible:opacity-100 disabled:cursor-default",
          isConfirmingDelete
            ? "h-5 w-8 rounded-sm bg-destructive/10 px-1 py-0 text-[11px] font-semibold leading-none text-destructive opacity-100 hover:bg-destructive/15 hover:text-destructive"
            : "size-7",
          isDeleting && "size-7 opacity-100",
        )}
        title={isConfirmingDelete ? "确认删除对话" : "删除对话"}
        aria-label={`${isConfirmingDelete ? "确认删除对话" : "删除对话"} ${session.title}`}
        disabled={isDeleting}
        onClick={() => {
          if (!isConfirmingDelete) {
            setIsConfirmingDelete(true);
            return;
          }

          void onConfirmDelete(workspace, session);
        }}
      >
        {isDeleting ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : isConfirmingDelete ? (
          "确定"
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </button>
    </div>
  );
};

const WorkspaceActions = ({ workspace, isDeleting, onEdit, onRequestDelete }: WorkspaceActionsProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "absolute top-1/2 right-1.5 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 data-[state=open]:text-foreground data-[state=open]:opacity-100 group-hover/workspace:opacity-100 focus-visible:opacity-100 disabled:cursor-default",
            isDeleting && "opacity-100",
          )}
          title="工作区操作"
          aria-label={`${workspace.name} 操作`}
          disabled={isDeleting}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex w-auto min-w-0 gap-1 p-1"
        onPointerLeave={() => setIsOpen(false)}
      >
        <DropdownMenuItem
          className="flex size-8 items-center justify-center rounded-md p-0"
          title="编辑工作区"
          aria-label="编辑工作区"
          onSelect={() => {
            setIsOpen(false);
            onEdit(workspace);
          }}
        >
          <Pencil className="size-4" />
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="flex size-8 items-center justify-center rounded-md p-0"
          title="删除工作区"
          aria-label="删除工作区"
          disabled={isDeleting}
          onSelect={() => {
            setIsOpen(false);
            onRequestDelete(workspace);
          }}
        >
          <Trash2 className="size-4" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const SidebarSessions = ({ workspaces, isLoading, error }: SessionsProps) => {
  const navigate = useNavigate();
  const params = useParams();
  const { openEditWorkspace, deleteWorkspace, deletingWorkspaceId } = useWorkspaceOverview();
  const sessionsByWorkspaceId = useChatSessionsStore((store) => store.sessionsByWorkspaceId);
  const loadingWorkspaceIds = useChatSessionsStore((store) => store.loadingWorkspaceIds);
  const errorByWorkspaceId = useChatSessionsStore((store) => store.errorByWorkspaceId);
  const runningSessionKeys = useChatSessionsStore((store) => store.runningSessionKeys);
  const deletingSessionKeys = useChatSessionsStore((store) => store.deletingSessionKeys);
  const loadWorkspaceSessions = useChatSessionsStore((store) => store.loadWorkspaceSessions);
  const deleteSession = useChatSessionsStore((store) => store.deleteSession);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(() => new Set());
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(() => new Set());
  const [showAllDefaultSessions, setShowAllDefaultSessions] = useState(false);
  const [workspacePendingDelete, setWorkspacePendingDelete] = useState<Workspace | null>(null);
  const defaultWorkspace = useMemo(() => workspaces.find(isDefaultWorkspace) ?? null, [workspaces]);
  const projectWorkspaces = useMemo(
    () => workspaces.filter((workspace) => !isDefaultWorkspace(workspace)),
    [workspaces],
  );
  const defaultSessions = defaultWorkspace ? (sessionsByWorkspaceId[defaultWorkspace.id] ?? []) : [];
  const workspaceSessionLoadKey = useMemo(
    () => workspaces.map((workspace) => `${workspace.id}:${workspace.path}`).join("\u0000"),
    [workspaces],
  );
  const isSessionsLoading = workspaces.some((workspace) => loadingWorkspaceIds[workspace.id]);
  const sessionsError = defaultWorkspace
    ? (errorByWorkspaceId[defaultWorkspace.id] ?? "")
    : (Object.values(errorByWorkspaceId).find(Boolean) ?? "");
  const visibleDefaultSessions = showAllDefaultSessions
    ? defaultSessions
    : defaultSessions.slice(0, DEFAULT_VISIBLE_SESSION_LIMIT);
  const hiddenDefaultSessionCount = Math.max(defaultSessions.length - visibleDefaultSessions.length, 0);

  useEffect(() => {
    workspaces.forEach((workspace) => {
      void loadWorkspaceSessions(workspace);
    });
  }, [loadWorkspaceSessions, workspaceSessionLoadKey]);

  const isSessionRunning = (workspace: Workspace, session: ChatSessionMeta) =>
    Boolean(runningSessionKeys[chatSessionKey(workspace.path, session.id)]);

  const isSessionDeleting = (workspace: Workspace, session: ChatSessionMeta) =>
    Boolean(deletingSessionKeys[chatSessionKey(workspace.path, session.id)]);

  const toggleWorkspace = (workspaceId: string) => {
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

  const toggleWorkspaceSessions = (workspaceId: string) => {
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

  const confirmDeleteWorkspace = async () => {
    if (!workspacePendingDelete) {
      return;
    }

    const deleted = await deleteWorkspace(workspacePendingDelete);
    if (deleted) {
      setWorkspacePendingDelete(null);
    }
  };

  const confirmDeleteSession = async (workspace: Workspace, session: ChatSessionMeta) => {
    await deleteSession(workspace, session.id);
    if (params.workspaceId === workspace.id && (params.chatId === session.id || params.sessionId === session.id)) {
      navigate("/chat-next", { replace: true });
    }
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-7 px-2.5 py-3 xl:px-3">
          <section className="space-y-3">
            <SectionHeader label="工作区" />
            <div className="space-y-2">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {error}
                </div>
              )}
              {isLoading ? (
                <div className="flex items-center gap-2 rounded-md px-3 py-4 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>正在读取工作区</span>
                </div>
              ) : projectWorkspaces.length ? (
                projectWorkspaces.map((workspace) => {
                  const sessions = sessionsByWorkspaceId[workspace.id] ?? [];
                  const isExpanded = expandedWorkspaceIds.has(workspace.id);
                  const isCollapsed = collapsedWorkspaceIds.has(workspace.id);
                  const visibleSessions = isCollapsed
                    ? []
                    : isExpanded
                      ? sessions
                      : sessions.slice(0, WORKSPACE_VISIBLE_SESSION_LIMIT);
                  const hiddenCount = Math.max(sessions.length - visibleSessions.length, 0);

                  return (
                    <div key={workspace.id} className="min-w-0 space-y-1">
                      <div className="group/workspace relative min-w-0">
                        <NavLink
                          to={`/chat/${workspace.id}/new`}
                          title={workspace.path}
                          className={({ isActive }) =>
                            cn(
                              "flex h-9 min-w-0 items-center gap-2 overflow-hidden rounded-md py-1 pr-[4.75rem] pl-3 text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground group-hover/workspace:bg-muted/55 group-hover/workspace:text-foreground group-has-[button[data-state=open]]/workspace:bg-muted/55 group-has-[button[data-state=open]]/workspace:text-foreground",
                              isActive && "bg-muted/55 text-foreground",
                            )
                          }
                        >
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          <span className="block min-w-0 flex-1 truncate text-base font-medium">{workspace.name}</span>
                        </NavLink>
                        {sessions.length > 0 && (
                          <button
                            type="button"
                            className={cn(
                              "absolute top-1/2 right-9 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 group-hover/workspace:opacity-100 group-has-[button[data-state=open]]/workspace:opacity-100 focus-visible:opacity-100 disabled:cursor-default",
                              isCollapsed && "opacity-100",
                            )}
                            title={isCollapsed ? "展开会话" : "折叠会话"}
                            aria-label={`${workspace.name} ${isCollapsed ? "展开会话" : "折叠会话"}`}
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleWorkspaceSessions(workspace.id)}
                          >
                            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        )}
                        <WorkspaceActions
                          workspace={workspace}
                          isDeleting={deletingWorkspaceId === workspace.id}
                          onEdit={openEditWorkspace}
                          onRequestDelete={setWorkspacePendingDelete}
                        />
                      </div>

                      <div className="space-y-0.5">
                        {visibleSessions.map((session) => (
                          <SessionRow
                            key={session.id}
                            to={`/chats/${workspace.id}/${session.id}`}
                            workspace={workspace}
                            session={session}
                            isDeleting={isSessionDeleting(workspace, session)}
                            isRunning={isSessionRunning(workspace, session)}
                            onConfirmDelete={confirmDeleteSession}
                          />
                        ))}
                        {!isCollapsed && sessions.length > WORKSPACE_VISIBLE_SESSION_LIMIT && (
                          <button
                            type="button"
                            className="flex h-8 w-full items-center gap-1.5 rounded-md py-1 pr-3 pl-9 text-left text-xs font-medium text-muted-foreground/75 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                            onClick={() => toggleWorkspace(workspace.id)}
                          >
                            <span className="min-w-0 truncate">
                              {isExpanded ? "收起较早对话" : `展开更多 ${hiddenCount} 条`}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="size-3.5 shrink-0" />
                            ) : (
                              <ChevronDown className="size-3.5 shrink-0" />
                            )}
                          </button>
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
              {sessionsError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {sessionsError}
                </div>
              )}
              {isSessionsLoading && defaultSessions.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>正在读取对话</span>
                </div>
              ) : visibleDefaultSessions.length && defaultWorkspace ? (
                <>
                  {visibleDefaultSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      to={`/chats/${defaultWorkspace.id}/${session.id}`}
                      workspace={defaultWorkspace}
                      session={session}
                      isDeleting={isSessionDeleting(defaultWorkspace, session)}
                      isRunning={isSessionRunning(defaultWorkspace, session)}
                      onConfirmDelete={confirmDeleteSession}
                    />
                  ))}
                  {defaultSessions.length > DEFAULT_VISIBLE_SESSION_LIMIT && (
                    <button
                      type="button"
                      className="group flex h-8 w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                      onClick={() => setShowAllDefaultSessions((current) => !current)}
                    >
                      <span className="min-w-0 truncate">
                        {showAllDefaultSessions ? "收起较早对话" : `展开更多 ${hiddenDefaultSessionCount} 条`}
                      </span>
                      {showAllDefaultSessions ? (
                        <ChevronUp className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0" />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <EmptyState>暂无对话</EmptyState>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
      <AlertDialog
        open={Boolean(workspacePendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingWorkspaceId) {
            setWorkspacePendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除工作区？</AlertDialogTitle>
            <AlertDialogDescription>
              这只会从侧边栏移除“{workspacePendingDelete?.name ?? ""}”的工作区配置，不会删除磁盘目录或已有文件。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingWorkspaceId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingWorkspaceId)}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteWorkspace();
              }}
            >
              {deletingWorkspaceId ? "正在删除" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
