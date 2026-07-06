import type { WorkspaceGroup, WorkspaceSection, WorkspaceOverview } from "../types";

const fallbackDefaultGroup: WorkspaceGroup = {
  id: "default",
  name: "默认分组",
  order: 0,
  isDefault: true,
  createdAt: 0,
  updatedAt: 0,
};

export const buildSections = (overview: WorkspaceOverview | null): WorkspaceSection[] => {
  const groups = overview?.groups ?? [];
  const workspaces = overview?.workspaces ?? [];
  const defaultGroup = groups.find((group) => group.isDefault) ?? fallbackDefaultGroup;
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const normalizedGroups = groups.length > 0 ? groups : [defaultGroup];

  return normalizedGroups.map((group) => {
    const items = workspaces
      .filter((workspace) => {
        if (workspace.groupId === group.id) {
          return true;
        }

        return group.isDefault && (!workspace.groupId || !knownGroupIds.has(workspace.groupId));
      })
      .sort((left, right) => {
        if (left.isPinned !== right.isPinned) {
          return left.isPinned ? -1 : 1;
        }

        if (left.order !== right.order) {
          return left.order - right.order;
        }

        return right.createdAt - left.createdAt;
      });

    return { group, workspaces: items };
  });
};
