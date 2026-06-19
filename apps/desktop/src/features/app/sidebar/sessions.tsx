import {
  ChevronDown,
  ChevronUp,
  Folder,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { listChatSessions } from "@/features/pages/chat/api";
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
  session: ChatSessionMeta;
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

const SessionRow = ({ to, session }: SessionRowProps) => (
  <NavLink
    to={to}
    title={`${session.title}\n${session.path}`}
    className={({ isActive }) =>
      cn(
        "flex h-9 min-w-0 items-center overflow-hidden rounded-md py-1 pr-3 pl-8 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground",
        isActive && "bg-muted/55 text-foreground",
      )
    }
  >
    <span className="min-w-0 flex-1 truncate">{session.title}</span>
    <span className="ml-2 shrink-0 text-xs font-medium text-muted-foreground/80">
      {session.isUnread ? (
        <span className="block size-2 rounded-full bg-primary" aria-label="未读消息" />
      ) : (
        formatSessionTime(session.updatedAt)
      )}
    </span>
  </NavLink>
);

const WorkspaceActions = ({
  workspace,
  isDeleting,
  onEdit,
  onRequestDelete,
}: WorkspaceActionsProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/75 hover:text-foreground group-hover/workspace:opacity-100 focus-visible:opacity-100"
        title="工作区操作"
        aria-label={`${workspace.name} 操作`}
        disabled={isDeleting}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-36">
      <DropdownMenuItem onSelect={() => onEdit(workspace)}>
        <Pencil className="size-4" />
        <span>编辑</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={isDeleting}
        onSelect={() => onRequestDelete(workspace)}
      >
        <Trash2 className="size-4" />
        <span>删除</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const SidebarSessions = ({
  workspaces,
  isLoading,
  error,
}: SessionsProps) => {
  const {
    openEditWorkspace,
    deleteWorkspace,
    deletingWorkspaceId,
  } = useWorkspaceOverview();
  const requestIdRef = useRef(0);
  const [sessionsByWorkspaceId, setSessionsByWorkspaceId] = useState<
    Record<string, ChatSessionMeta[]>
  >({});
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showAllDefaultSessions, setShowAllDefaultSessions] = useState(false);
  const [workspacePendingDelete, setWorkspacePendingDelete] =
    useState<Workspace | null>(null);
  const defaultWorkspace = useMemo(
    () => workspaces.find(isDefaultWorkspace) ?? null,
    [workspaces],
  );
  const projectWorkspaces = useMemo(
    () => workspaces.filter((workspace) => !isDefaultWorkspace(workspace)),
    [workspaces],
  );
  const defaultSessions = defaultWorkspace
    ? sessionsByWorkspaceId[defaultWorkspace.id] ?? []
    : [];
  const visibleDefaultSessions = showAllDefaultSessions
    ? defaultSessions
    : defaultSessions.slice(0, DEFAULT_VISIBLE_SESSION_LIMIT);
  const hiddenDefaultSessionCount = Math.max(
    defaultSessions.length - visibleDefaultSessions.length,
    0,
  );

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!workspaces.length) {
      setSessionsByWorkspaceId({});
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    void Promise.all(
      workspaces.map(async (workspace) => [
        workspace.id,
        await listChatSessions(workspace.path),
      ] as const),
    )
      .then((entries) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setSessionsByWorkspaceId(Object.fromEntries(entries));
      })
      .catch((caught) => {
        if (requestIdRef.current === requestId) {
          setSessionsError(String(caught));
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setIsSessionsLoading(false);
        }
      });
  }, [workspaces]);

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

  const confirmDeleteWorkspace = async () => {
    if (!workspacePendingDelete) {
      return;
    }

    const deleted = await deleteWorkspace(workspacePendingDelete);
    if (deleted) {
      setWorkspacePendingDelete(null);
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
                const visibleSessions = isExpanded
                  ? sessions
                  : sessions.slice(0, WORKSPACE_VISIBLE_SESSION_LIMIT);
                const hiddenCount = Math.max(
                  sessions.length - visibleSessions.length,
                  0,
                );

                return (
                  <div key={workspace.id} className="min-w-0 space-y-1">
                    <div className="group/workspace flex min-w-0 items-center gap-1">
                      <NavLink
                        to={`/chat/${workspace.id}/new`}
                        title={workspace.path}
                        className={({ isActive }) =>
                          cn(
                            "flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-3 py-1 text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground",
                            isActive && "bg-muted/55 text-foreground",
                          )
                        }
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="block min-w-0 flex-1 truncate text-base font-medium">
                          {workspace.name}
                        </span>
                      </NavLink>
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
                          to={`/chat/${workspace.id}/session/${session.id}`}
                          session={session}
                        />
                      ))}
                      {sessions.length > WORKSPACE_VISIBLE_SESSION_LIMIT && (
                        <button
                          type="button"
                          className="flex h-8 w-full items-center gap-1.5 rounded-md py-1 pr-3 pl-9 text-left text-xs font-medium text-muted-foreground/75 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                          onClick={() => toggleWorkspace(workspace.id)}
                        >
                          <span className="min-w-0 truncate">
                            {isExpanded
                              ? "收起较早对话"
                              : `展开更多 ${hiddenCount} 条`}
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
                    to={`/chat/${defaultWorkspace.id}/session/${session.id}`}
                    session={session}
                  />
                ))}
                {defaultSessions.length > DEFAULT_VISIBLE_SESSION_LIMIT && (
                  <button
                    type="button"
                    className="group flex h-8 w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                    onClick={() => setShowAllDefaultSessions((current) => !current)}
                  >
                    <span className="min-w-0 truncate">
                      {showAllDefaultSessions
                        ? "收起较早对话"
                        : `展开更多 ${hiddenDefaultSessionCount} 条`}
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
            <AlertDialogCancel disabled={Boolean(deletingWorkspaceId)}>
              取消
            </AlertDialogCancel>
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
