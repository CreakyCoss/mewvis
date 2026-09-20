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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { WorkspaceDialog, type WorkspaceDialogHandle } from "@/workbench/pages/chats/components/workspace-dialog";
import { useWorkspaceStore, type ChatActivity } from "@/workbench/pages/chats/workspace-store";
import { chatActivityPresentation } from "../chat-activity";
import type { ChatMeta } from "@/api/chat";
import type { Workspace } from "@/api/workspace";
import { cn } from "design-system/lib/utils";
import { formatRelativeTime } from "@/utils/time";

const DEFAULT_VISIBLE_CHAT_LIMIT = 5;
const WORKSPACE_VISIBLE_CHAT_LIMIT = 4;

type SidebarChatsProps = {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string;
};

type ChatRowProps = {
  to: string;
  workspace: Workspace;
  chat: ChatMeta;
  activity: ChatActivity | null;
  onConfirmDelete: (workspace: Workspace, chat: ChatMeta) => void;
};

type WorkspaceActionsProps = {
  workspace: Workspace;
  onEdit: (workspace: Workspace) => void;
  onRequestDelete: (workspace: Workspace) => void;
};

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center justify-between px-2.5 pt-1">
    <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground/85">{label}</span>
  </div>
);

const EmptyState = ({ children }: { children: string }) => (
  <div className="rounded-lg border border-dashed border-sidebar-border/80 bg-sidebar-accent/25 px-3 py-2 text-xs text-muted-foreground/75">
    {children}
  </div>
);

const ChatRow = ({ to, workspace, chat, activity, onConfirmDelete }: ChatRowProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const presentation = activity ? chatActivityPresentation[activity] : null;
  const ActivityIcon = presentation?.icon;

  return (
    <div className="group/chat relative min-w-0" onMouseLeave={() => setIsConfirmingDelete(false)}>
      <NavLink
        to={to}
        title={`${chat.title}${presentation ? ` · ${presentation.label}` : ""}\n${chat.path}`}
        className={({ isActive }) =>
          cn(
            "flex h-9 min-w-0 items-center overflow-hidden rounded-lg py-1 pr-3 pl-8 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground group-hover/chat:bg-sidebar-accent/70 group-hover/chat:text-sidebar-foreground",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )
        }
      >
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        <span className="ml-2 flex h-7 w-12 shrink-0 items-center justify-end whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground/80 group-hover/chat:opacity-0 group-focus-within/chat:opacity-0">
          {presentation && ActivityIcon ? (
            <ActivityIcon className={presentation.className} aria-label={presentation.label} />
          ) : chat.isUnread ? (
            <span className="mt-1 block size-2 rounded-full bg-primary" aria-label="未读消息" />
          ) : (
            formatRelativeTime(chat.updatedAt)
          )}
        </span>
      </NavLink>
      <button
        type="button"
        className={cn(
          "absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:bg-background/75 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/25 group-hover/chat:opacity-100 focus-visible:opacity-100 disabled:cursor-default",
          isConfirmingDelete
            ? "h-5 w-8 rounded-sm bg-destructive/10 px-1 py-0 text-xs font-semibold leading-none text-destructive opacity-100 hover:bg-destructive/15 hover:text-destructive"
            : "size-7",
        )}
        title={isConfirmingDelete ? "确认删除对话" : "删除对话"}
        aria-label={`${isConfirmingDelete ? "确认删除对话" : "删除对话"} ${chat.title}`}
        onClick={() => {
          if (!isConfirmingDelete) {
            setIsConfirmingDelete(true);
            return;
          }

          onConfirmDelete(workspace, chat);
        }}
      >
        {isConfirmingDelete ? "确定" : <Trash2 className="size-3.5" />}
      </button>
    </div>
  );
};

const WorkspaceActions = ({ workspace, onEdit, onRequestDelete }: WorkspaceActionsProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="absolute top-1/2 right-1.5 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 data-[state=open]:text-foreground data-[state=open]:opacity-100 group-hover/workspace:opacity-100 focus-visible:opacity-100"
          title="工作区操作"
          aria-label={`${workspace.name} 操作`}
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

export const SidebarChats = ({ workspaces, isLoading, error }: SidebarChatsProps) => {
  const navigate = useNavigate();
  const params = useParams();
  const workspaceStore = useWorkspaceStore();
  const workspaceDialogRef = useRef<WorkspaceDialogHandle>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(() => new Set());
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(() => new Set());
  const [showAllDefaultChats, setShowAllDefaultChats] = useState(false);
  const [workspacePendingDelete, setWorkspacePendingDelete] = useState<Workspace | null>(null);
  const defaultWorkspace = useMemo(() => workspaces.find((workspace) => workspace.isDefault) ?? null, [workspaces]);
  const projectWorkspaces = useMemo(() => workspaces.filter((workspace) => !workspace.isDefault), [workspaces]);
  const defaultChats = defaultWorkspace ? (workspaceStore.chatsByWorkspaceId[defaultWorkspace.id] ?? []) : [];
  const isChatsLoading = workspaceStore.isLoading;
  const visibleDefaultChats = showAllDefaultChats ? defaultChats : defaultChats.slice(0, DEFAULT_VISIBLE_CHAT_LIMIT);
  const hiddenDefaultChatCount = Math.max(defaultChats.length - visibleDefaultChats.length, 0);

  useEffect(() => {
    void workspaceStore.loadWorkspaces();
  }, [workspaceStore.loadWorkspaces]);

  const chatActivity = (workspace: Workspace, chat: ChatMeta) =>
    workspaceStore.chatActivityMap[workspace.id]?.[chat.id] ?? null;

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

  const toggleWorkspaceChats = (workspaceId: string) => {
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

  const confirmDeleteWorkspace = () => {
    if (!workspacePendingDelete) {
      return;
    }

    const workspaceId = workspacePendingDelete.id;
    setWorkspacePendingDelete(null);
    void workspaceStore.deleteWorkspace(workspaceId);
  };

  const confirmDeleteChat = (workspace: Workspace, chat: ChatMeta) => {
    void workspaceStore.deleteChat(workspace, chat.id);
    if (params.workspaceId === workspace.id && params.chatId === chat.id) {
      navigate("/chat", { replace: true });
    }
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-2.5 py-3 xl:px-3">
          <section className="space-y-2">
            <SectionHeader label="工作区" />
            <div className="space-y-2">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {error}
                </div>
              )}
              {isLoading ? (
                <div className="flex items-center gap-2 rounded-md px-3 py-4 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                  <span>正在读取工作区</span>
                </div>
              ) : projectWorkspaces.length ? (
                projectWorkspaces.map((workspace) => {
                  const chats = workspaceStore.chatsByWorkspaceId[workspace.id] ?? [];
                  const isExpanded = expandedWorkspaceIds.has(workspace.id);
                  const isCollapsed = collapsedWorkspaceIds.has(workspace.id);
                  const visibleChats = isCollapsed
                    ? []
                    : isExpanded
                      ? chats
                      : chats.slice(0, WORKSPACE_VISIBLE_CHAT_LIMIT);
                  const hiddenCount = Math.max(chats.length - visibleChats.length, 0);

                  return (
                    <div key={workspace.id} className="min-w-0 space-y-1">
                      <div className="group/workspace relative min-w-0">
                        <Link
                          to="/chat"
                          title={workspace.path}
                          className={cn(
                            "flex h-9 min-w-0 items-center gap-2 overflow-hidden rounded-lg py-1 pr-[4.75rem] pl-3 text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground group-hover/workspace:bg-sidebar-accent/70 group-hover/workspace:text-sidebar-foreground group-has-[button[data-state=open]]/workspace:bg-sidebar-accent/70 group-has-[button[data-state=open]]/workspace:text-sidebar-foreground",
                            workspaceStore.currentWorkspace?.id === workspace.id &&
                              "bg-sidebar-accent text-sidebar-accent-foreground",
                          )}
                          onClick={() => workspaceStore.setCurrentWorkspace(workspace)}
                        >
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          <span className="block min-w-0 flex-1 truncate text-sm font-medium">{workspace.name}</span>
                        </Link>
                        {chats.length > 0 && (
                          <button
                            type="button"
                            className={cn(
                              "absolute top-1/2 right-9 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 group-hover/workspace:opacity-100 group-has-[button[data-state=open]]/workspace:opacity-100 focus-visible:opacity-100 disabled:cursor-default",
                              isCollapsed && "opacity-100",
                            )}
                            title={isCollapsed ? "展开会话" : "折叠会话"}
                            aria-label={`${workspace.name} ${isCollapsed ? "展开会话" : "折叠会话"}`}
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleWorkspaceChats(workspace.id)}
                          >
                            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        )}
                        <WorkspaceActions
                          workspace={workspace}
                          onEdit={(targetWorkspace) => workspaceDialogRef.current?.(targetWorkspace)}
                          onRequestDelete={setWorkspacePendingDelete}
                        />
                      </div>

                      <div className="space-y-0.5">
                        {visibleChats.map((chat) => (
                          <ChatRow
                            key={chat.id}
                            to={`/chats/${workspace.id}/${chat.id}`}
                            workspace={workspace}
                            chat={chat}
                            activity={chatActivity(workspace, chat)}
                            onConfirmDelete={confirmDeleteChat}
                          />
                        ))}
                        {!isCollapsed && chats.length > WORKSPACE_VISIBLE_CHAT_LIMIT && (
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

          <section className="space-y-2">
            <SectionHeader label="对话" />
            <div className="space-y-2">
              {isChatsLoading && defaultChats.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                  <span>正在读取对话</span>
                </div>
              ) : visibleDefaultChats.length && defaultWorkspace ? (
                <>
                  {visibleDefaultChats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      to={`/chats/${defaultWorkspace.id}/${chat.id}`}
                      workspace={defaultWorkspace}
                      chat={chat}
                      activity={chatActivity(defaultWorkspace, chat)}
                      onConfirmDelete={confirmDeleteChat}
                    />
                  ))}
                  {defaultChats.length > DEFAULT_VISIBLE_CHAT_LIMIT && (
                    <button
                      type="button"
                      className="group flex h-8 w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                      onClick={() => setShowAllDefaultChats((current) => !current)}
                    >
                      <span className="min-w-0 truncate">
                        {showAllDefaultChats ? "收起较早对话" : `展开更多 ${hiddenDefaultChatCount} 条`}
                      </span>
                      {showAllDefaultChats ? (
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
          if (!open) {
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
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteWorkspace();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WorkspaceDialog bind={workspaceDialogRef} />
    </>
  );
};
