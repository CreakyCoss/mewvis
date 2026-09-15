import { invoke as invokeTauri, isTauri } from "@tauri-apps/api/core";
import { listen as listenTauri } from "@tauri-apps/api/event";
import { invokeNode } from "./http";
import { listenNode } from "./events";

/** Desktop retains Rust ownership; the browser uses the independent Node server. */
export const backendKind = () => (isTauri() ? "tauri" : "node");
export const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
  backendKind() === "tauri" ? invokeTauri<T>(command, args) : invokeNode<T>(command, args);
export const listen = <T>(name: string, listener: (event: { payload: T }) => void): Promise<() => void> =>
  backendKind() === "tauri" ? listenTauri<T>(name, listener) : listenNode<T>(name, listener);
