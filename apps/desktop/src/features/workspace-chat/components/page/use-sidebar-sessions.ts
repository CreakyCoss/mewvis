import { useMemo } from "react";
import { isDefaultWorkspace } from "@/features/workspaces/default-workspace";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import type { ChatSessionMeta } from "../../types";

type UseSidebarSessionsInput = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  chatSessions: ChatSessionMeta[];
  defaultChatSessions: ChatSessionMeta[];
  showAllSessions: boolean;
};

export const useSidebarSessions = ({
  workspace,
  workspaceSections,
  chatSessions,
  defaultChatSessions,
  showAllSessions,
}: UseSidebarSessionsInput) => {
  const allSidebarWorkspaces = useMemo(
    () => workspaceSections.flatMap((section) => section.workspaces),
    [workspaceSections],
  );
  const defaultWorkspace = useMemo(
    () => allSidebarWorkspaces.find(isDefaultWorkspace) ?? (isDefaultWorkspace(workspace) ? workspace : null),
    [allSidebarWorkspaces, workspace],
  );
  const isActiveDefaultWorkspace = isDefaultWorkspace(workspace);
  const sidebarWorkspaces = useMemo(
    () => allSidebarWorkspaces.filter((item) => !isDefaultWorkspace(item)),
    [allSidebarWorkspaces],
  );
  const sidebarWorkspacesSignature = useMemo(
    () => sidebarWorkspaces.map((item) => `${item.id}\u0000${item.path}`).join("\u0001"),
    [sidebarWorkspaces],
  );
  const sidebarChatSessions = isActiveDefaultWorkspace
    ? chatSessions
    : defaultChatSessions;
  const visibleSidebarSessions = showAllSessions
    ? sidebarChatSessions
    : sidebarChatSessions.slice(0, 5);

  return {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarWorkspacesSignature,
    sidebarChatSessions,
    visibleSidebarSessions,
  };
};
