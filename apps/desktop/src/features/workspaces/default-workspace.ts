import type { Workspace, WorkspaceOverview } from "./types";
import { APP_DATA_DIR_NAME, DEFAULT_WORKSPACE_DIR_NAME } from "@/product-config";

export const DEFAULT_WORKSPACE_ID = "default-workspace";

export const createWebDefaultWorkspaceOverview = (): WorkspaceOverview => {
  const now = Date.now();
  const defaultGroup = {
    id: "default-group",
    name: "默认分组",
    order: 0,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };

  return {
    configDbPath: `~/${APP_DATA_DIR_NAME}/config.db`,
    groups: [defaultGroup],
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: "默认工作区",
        description: "用于未绑定具体工作区的会话",
        path: `~/${APP_DATA_DIR_NAME}/${DEFAULT_WORKSPACE_DIR_NAME}`,
        isDefault: true,
        isPinned: true,
        order: 0,
        groupId: defaultGroup.id,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
};

export const isDefaultWorkspace = (workspace: Workspace) => workspace.isDefault;
