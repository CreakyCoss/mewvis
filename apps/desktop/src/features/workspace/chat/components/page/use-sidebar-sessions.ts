import { useMemo } from "react";
import { isDefaultWorkspace } from "@/features/workspace/default-workspace";
import type { Workspace, WorkspaceSection } from "@/features/workspace/types";
import type { ChatSessionMeta } from "../../types";

type UseSidebarSessionsInput = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  chatSessions: ChatSessionMeta[];
  defaultChatSessions: ChatSessionMeta[];
};

export const useSidebarSessions = ({
  workspace,
  workspaceSections,
  chatSessions,
  defaultChatSessions,
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

  return {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarWorkspacesSignature,
    sidebarChatSessions,
  };
};
