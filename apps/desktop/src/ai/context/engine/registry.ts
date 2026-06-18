import {
  createDefaultContextEngine,
  DEFAULT_CONTEXT_ENGINE_ID,
  HYBRID_MEMORY_CONTEXT_ENGINE_ID,
  RAG_CONTEXT_ENGINE_ID,
} from "./runtime-context";
import {
  createPlaceholderMemoryLayer,
} from "./memory-layers";
import {
  createPlaceholderRagIndex,
} from "./rag";
import type { ContextEngine } from "./types";

const contextEngineRegistry = new Map<string, ContextEngine>();

export const registerContextEngine = (engine: ContextEngine) => {
  contextEngineRegistry.set(engine.id, engine);
  return engine;
};

export const defaultContextEngine = registerContextEngine(createDefaultContextEngine());

export const ragContextEngine = registerContextEngine(createDefaultContextEngine({
  id: RAG_CONTEXT_ENGINE_ID,
  label: "RAG 索引",
  description: "发送消息时从全局知识库已启用集合召回相关片段，并结合滚动摘要回答。",
  capabilities: ["rolling_summary", "agent_session_sync", "rag_index"],
  experimental: true,
  services: {
    ragIndex: createPlaceholderRagIndex(),
  },
  metadata: {
    fallback: DEFAULT_CONTEXT_ENGINE_ID,
  },
}));

export const hybridMemoryContextEngine = registerContextEngine(createDefaultContextEngine({
  id: HYBRID_MEMORY_CONTEXT_ENGINE_ID,
  label: "混合记忆",
  description: "结合全局知识库召回、滚动摘要和预留多层记忆快照管理上下文。",
  capabilities: ["rolling_summary", "agent_session_sync", "rag_index", "memory_layers"],
  experimental: true,
  services: {
    ragIndex: createPlaceholderRagIndex("hybrid-rag"),
    memoryLayers: [
      createPlaceholderMemoryLayer("conversation-memory", "conversation"),
      createPlaceholderMemoryLayer("agent-memory", "agent"),
      createPlaceholderMemoryLayer("document-memory", "document"),
    ],
  },
  metadata: {
    fallback: DEFAULT_CONTEXT_ENGINE_ID,
  },
}));

export const CONTEXT_ENGINE_REGISTRY = contextEngineRegistry;

export const listContextEngines = () => [...contextEngineRegistry.values()];

export const getContextEngine = (engineId?: string | null) =>
  engineId && contextEngineRegistry.has(engineId)
    ? contextEngineRegistry.get(engineId) ?? defaultContextEngine
    : defaultContextEngine;

export {
  DEFAULT_CONTEXT_ENGINE_ID,
  DEFAULT_CONTEXT_ENGINE_VERSION,
  HYBRID_MEMORY_CONTEXT_ENGINE_ID,
  RAG_CONTEXT_ENGINE_ID,
} from "./runtime-context";
