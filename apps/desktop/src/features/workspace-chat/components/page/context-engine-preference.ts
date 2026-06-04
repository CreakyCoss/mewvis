import {
  DEFAULT_CONTEXT_ENGINE_ID,
  getContextEngine,
} from "@/ai/agent-context";
import { appStorageKey } from "@/product-config";

const CONTEXT_ENGINE_STORAGE_KEY = appStorageKey("context-engine");

export const readPreferredContextEngineId = () => {
  try {
    return getContextEngine(window.localStorage.getItem(CONTEXT_ENGINE_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_CONTEXT_ENGINE_ID;
  }
};

export const writePreferredContextEngineId = (engineId: string) => {
  try {
    window.localStorage.setItem(CONTEXT_ENGINE_STORAGE_KEY, engineId);
  } catch {
    // Ignore storage failures; the in-memory state still applies for this session.
  }
};
