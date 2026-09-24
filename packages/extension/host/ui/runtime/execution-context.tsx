import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { UISessionContext } from "../index.js";

/** Native host port. It does not depend on a chat implementation or plugin SDK. */
export type UIExecutionSnapshot = {
  taskId: string;
  /** A failed cancellation can be retried while the task remains reserved. */
  cancelError?: string;
  state:
    | "running"
    | "pausing"
    | "paused"
    | "cancelling"
    | "completed"
    | "cancelled"
    | "failed";
};
export interface UIExecutionSource {
  getSnapshot(context: UISessionContext): UIExecutionSnapshot | undefined;
  subscribe(context: UISessionContext, listener: () => void): () => void;
  resume(context: UISessionContext, taskId: string): Promise<void>;
  cancel(context: UISessionContext, taskId: string): Promise<void>;
}
export const ExecutionContext = createContext<UIExecutionSource | undefined>(
  undefined,
);
export function useHostExecution(context: UISessionContext) {
  const source = useContext(ExecutionContext);
  const binding = useMemo(
    () => ({
      read: () => source?.getSnapshot(context),
      subscribe: (listener: () => void) =>
        source?.subscribe(context, listener) ?? (() => {}),
    }),
    [source, context.workspacePath, context.chatId],
  );
  const snapshot = useSyncExternalStore(
    binding.subscribe,
    binding.read,
    binding.read,
  );
  return { source, snapshot };
}
