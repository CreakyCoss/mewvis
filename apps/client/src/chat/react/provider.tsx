import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { isChatBusy, type ChatRunConfig, type ChatSession } from "../core";
import { getChatViewState } from "./view-state";
import type { ChatDisplayOptions, ChatInputFile, ChatViewPersistence } from "./types";

type Environment = {
  files?: (session: ChatSession) => ChatInputFile[];
  persistence?: (session: ChatSession, viewId: string) => ChatViewPersistence | undefined;
  renderBeforeComposer?: (session: ChatSession) => ReactNode;
};
const EnvironmentContext = createContext<Environment>({});
export function ChatEnvironment({ children, ...environment }: PropsWithChildren<Environment>) {
  return <EnvironmentContext.Provider value={environment}>{children}</EnvironmentContext.Provider>;
}
const SessionContext = createContext<{ session: ChatSession; view: ReturnType<typeof getChatViewState> } | null>(null);
export function ChatProvider({
  session,
  viewId = "main",
  children,
}: PropsWithChildren<{ session: ChatSession; viewId?: string }>) {
  const environment = useContext(EnvironmentContext);
  const view = useMemo(() => getChatViewState(session, viewId), [session, viewId]);
  useEffect(() => {
    view.connect(environment.persistence?.(session, viewId));
  }, [environment, session, view, viewId]);
  const value = useMemo(() => ({ session, view }), [session, view]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
function useBinding() {
  const binding = useContext(SessionContext);
  if (!binding) throw new Error("Chat 组件需要 Chat.Provider");
  return binding;
}
export function useChatSession() {
  return useBinding().session;
}
export function useChatSnapshot() {
  const session = useChatSession();
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}
export function useChatActions() {
  return useChatSession();
}
export function useBeforeComposer() {
  const session = useChatSession();
  return useContext(EnvironmentContext).renderBeforeComposer?.(session);
}
export function useChatViewState() {
  const { view } = useBinding();
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  return { ...snapshot, updatePreferences: view.updatePreferences, retryPreferences: view.retryPreferences };
}
export function useChatComposer() {
  const { session, view } = useBinding();
  const snapshot = useChatSnapshot();
  const draft = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const environment = useContext(EnvironmentContext);
  const controls = useChatControls();
  const busy = isChatBusy(snapshot) || draft.submitting;
  const disabled = !snapshot.initialized || snapshot.phase === "closed" || snapshot.phase === "closing" || busy;
  return {
    ...draft,
    controls,
    initialized: snapshot.initialized,
    files: environment.files?.(session) ?? [],
    commands: snapshot.resources.commands ?? [],
    skills: [
      ...new Map(
        (snapshot.resources.skillGroups ?? []).flatMap((group) =>
          group.skills
            .filter((skill) => snapshot.config.selectedSkillKeys.includes(skill.key))
            .map((skill) => [skill.key, skill] as const),
        ),
      ).values(),
    ],
    busy,
    disabled,
    canSubmit:
      !disabled &&
      Boolean(draft.draft.text.trim()) &&
      Boolean(snapshot.resources.models?.some((model) => model.value === snapshot.config.selectedModelId)) &&
      Boolean(snapshot.resources.permissionOptions?.some((option) => option.mode === snapshot.config.permissionMode)),
    setDraft: view.setDraft,
    submit: view.submit,
    stop: session.stop,
  };
}
export function useChatControls() {
  const snapshot = useChatSnapshot();
  const session = useChatSession();
  const view = useChatViewState();
  const viewError = useBinding().view.setError;
  return {
    resources: snapshot.resources,
    options: { ...snapshot.config, ...view.preferences },
    updateOptions(patch: Partial<ChatRunConfig & ChatDisplayOptions>) {
      const { showThinkingProcess, showToolCallProcess, ...config } = patch;
      if (showThinkingProcess !== undefined || showToolCallProcess !== undefined)
        view.updatePreferences({
          ...(showThinkingProcess !== undefined ? { showThinkingProcess } : {}),
          ...(showToolCallProcess !== undefined ? { showToolCallProcess } : {}),
        });
      if (Object.keys(config).length)
        void session
          .updateConfig(config)
          .then((result) => {
            if (!result.ok) viewError(result.error);
          })
          .catch((error) => viewError(String(error)));
    },
  };
}
