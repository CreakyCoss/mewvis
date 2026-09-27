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
  templateId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type SaveAgentInput = Omit<AgentDefinition, "id" | "templateId" | "createdAt" | "updatedAt"> & {
  id?: string | null;
};

export type AgentTemplate = Omit<AgentDefinition, "templateId" | "createdAt" | "updatedAt"> & {
  references: { name: string; url: string }[];
};
