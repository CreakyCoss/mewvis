export type ContextEngineCapability =
  | "rolling_summary"
  | "agent_session_sync"
  | "rag_index"
  | "memory_layers";

export type ContextEngineDescriptor = {
  id: string;
  version: number;
  label: string;
  description: string;
  capabilities: ContextEngineCapability[];
  experimental?: boolean;
};
