export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isDefault: boolean;
  isPinned: boolean;
  order: number;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceInput {
  name: string;
  description: string | null;
  path: string;
  groupId: string | null;
}
