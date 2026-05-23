export type WorkspaceFileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: number | null;
};

export type WorkspaceFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};
