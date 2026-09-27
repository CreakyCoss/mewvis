export type AgentDefinition = {
  id: string;
  name: string;
  avatar: string;
  summary: string;
  category: string;
  instructions: string;
  useCases: string[];
  starterPrompts: string[];
  skillKeys: string[];
  toolNames: string[];
  knowledgeCollectionIds: string[];
  source: "builtin" | "custom";
  createdAt: number;
  updatedAt: number;
};
export type SaveAgentInput = Omit<AgentDefinition, "id" | "source" | "createdAt" | "updatedAt"> & {
  id?: string | null;
};
