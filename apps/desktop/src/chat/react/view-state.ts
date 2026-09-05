import type { ChatSession } from "../core";
import type { ChatDisplayOptions, ChatViewPersistence, ComposerDraft } from "./types";

const views = new WeakMap<ChatSession, Map<string, ReturnType<typeof createViewState>>>();
function createViewState() {
  let state = {
    draft: { text: "", blocks: [] } as ComposerDraft,
    revision: 0,
    clearVersion: 0,
    submitting: false,
    error: "",
    preferenceError: "",
    preferences: { showThinkingProcess: true, showToolCallProcess: true },
  };
  const listeners = new Set<() => void>();
  let persistence: ChatViewPersistence | undefined;
  let preferencesRevision = 0;
  let initialized: Promise<void> | undefined;
  const patch = (value: Partial<typeof state>) => {
    state = { ...state, ...value };
    listeners.forEach((listener) => listener());
  };
  const savePreferences = async () => {
    try {
      await persistence?.savePreferences(state.preferences);
      patch({ preferenceError: "" });
    } catch (error) {
      patch({ preferenceError: error instanceof Error ? error.message : String(error) });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(adapter?: ChatViewPersistence) {
      if (!adapter || initialized) return;
      persistence = adapter;
      const revision = preferencesRevision;
      initialized = adapter
        .loadPreferences()
        .then((preferences) => {
          if (revision === preferencesRevision) patch({ preferences });
        })
        .catch((error) => {
          patch({ preferenceError: String(error) });
          initialized = undefined;
        });
    },
    setDraft(draft: ComposerDraft) {
      if (JSON.stringify(draft) !== JSON.stringify(state.draft))
        patch({ draft, revision: state.revision + 1, error: "" });
    },
    clear(revision: number) {
      if (state.revision === revision)
        patch({
          draft: { text: "", blocks: [] },
          revision: revision + 1,
          clearVersion: state.clearVersion + 1,
          error: "",
        });
    },
    setSubmitting: (submitting: boolean) => patch({ submitting }),
    setError: (error: string) => patch({ error }),
    updatePreferences(value: Partial<ChatDisplayOptions>) {
      preferencesRevision++;
      patch({ preferences: { ...state.preferences, ...value } });
      void savePreferences();
    },
    retryPreferences: savePreferences,
  };
}
export function getChatViewState(session: ChatSession, viewId: string) {
  let map = views.get(session);
  if (!map) {
    map = new Map();
    views.set(session, map);
  }
  let view = map.get(viewId);
  if (!view) {
    view = createViewState();
    map.set(viewId, view);
  }
  return view;
}
