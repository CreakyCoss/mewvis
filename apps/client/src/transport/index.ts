import { invokeNode } from "./http";
import { listenNode } from "./events";

export const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> => invokeNode<T>(command, args);
export const listen = <T>(name: string, listener: (event: { payload: T }) => void): Promise<() => void> =>
  listenNode<T>(name, listener);
