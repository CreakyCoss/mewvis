export type AiAgent = {
  id: string;
  name: string;
  avatar: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SaveAiAgentInput = {
  id?: string | null;
  name: string;
  avatar: string;
  description?: string | null;
};
