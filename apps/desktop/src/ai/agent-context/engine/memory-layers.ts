import type {
  ContextMemoryLayerSnapshot,
  ConversationMessage,
} from "../core/types";

export type ContextMemoryKind = ContextMemoryLayerSnapshot["kind"];

export type ContextMemoryItem = {
  id: string;
  layerId: string;
  kind: ContextMemoryKind;
  content: string;
  score?: number | null;
  tokenCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type ContextMemoryQuery = {
  query: string;
  conversation: ConversationMessage[];
  maxItems?: number;
  metadata?: Record<string, unknown>;
};

export type ContextMemoryLayer = {
  id: string;
  kind: ContextMemoryKind;
  version: number;
  getSnapshot(): Promise<ContextMemoryLayerSnapshot | null> | ContextMemoryLayerSnapshot | null;
  retrieve(input: ContextMemoryQuery): Promise<ContextMemoryItem[]>;
  record?(items: ContextMemoryItem[]): Promise<void>;
  compact?(conversation: ConversationMessage[]): Promise<void>;
  invalidate?(reason: "history_changed" | "workspace_changed" | "strategy_changed"): Promise<void>;
};

export const createPlaceholderMemoryLayer = (
  id: string,
  kind: ContextMemoryKind,
): ContextMemoryLayer => ({
  id,
  kind,
  version: 1,
  getSnapshot: () => ({
    layerId: id,
    kind,
    version: 1,
    updatedAt: Date.now(),
    itemCount: 0,
    tokenCount: 0,
  }),
  retrieve: async () => [],
  record: async () => undefined,
  compact: async () => undefined,
  invalidate: async () => undefined,
});
