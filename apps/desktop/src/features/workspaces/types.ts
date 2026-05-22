export type WorkspaceGroup = {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isPinned: boolean;
  order: number;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceOverview = {
  configDbPath: string;
  groups: WorkspaceGroup[];
  workspaces: Workspace[];
};

export type WorkspaceForm = {
  name: string;
  description: string;
  path: string;
  groupId: string;
};

export type WorkspaceGroupWithItems = {
  group: WorkspaceGroup;
  workspaces: Workspace[];
};

export const defaultWorkspaceForm: WorkspaceForm = {
  name: "",
  description: "",
  path: "",
  groupId: "default",
};
