import { BackendError, requestBackend } from "./http";
import { readEvents, type BackendEvent } from "./sse";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "unavailable" | "reload-required";
type Listener = (event: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
const observers = new Set<() => void>();
let state: ConnectionState = "connecting";
let controller: AbortController | undefined;
let ready: Promise<void> | undefined;
let cursor: string | undefined;
let requiresReload = false;
export const getConnectionState = () => state;
export function observeConnection(listener: () => void) {
  observers.add(listener);
  return () => {
    observers.delete(listener);
  };
}
function update(next: ConnectionState) {
  state = requiresReload && next === "connected" ? "reload-required" : next;
  observers.forEach((listener) => listener());
}
function emit(event: BackendEvent) {
  if (event.id !== undefined) cursor = event.id || undefined;
  for (const listener of listeners.get(event.name) ?? []) {
    try {
      listener({ payload: event.payload });
    } catch (error) {
      console.error("后端事件处理失败", error);
    }
  }
}
function start() {
  const abort = new AbortController();
  controller = abort;
  update("connecting");
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  let connected = false;
  ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void (async () => {
    let delay = 300;
    while (!abort.signal.aborted) {
      try {
        const response = await requestBackend("events", {
          signal: abort.signal,
          headers: cursor ? { "Last-Event-ID": cursor } : {},
        });
        if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
          throw new BackendError("Node 事件接口未接通，请使用 pnpm dev:web 启动", "INVALID_RESPONSE");
        cursor ??= response.headers.get("x-event-cursor") ?? undefined;
        connected = true;
        delay = 300;
        update("connected");
        resolveReady();
        await readEvents(response.body, emit);
        if (!abort.signal.aborted) throw new Error("事件连接已断开");
      } catch (error) {
        if (abort.signal.aborted) break;
        if (error instanceof BackendError && error.code === "EVENT_CURSOR_EXPIRED") {
          // Missing events cannot be fabricated. Keep the UI explicit until the user reloads
          // saved state; never retry a task or a write operation automatically.
          requiresReload = true;
          cursor = undefined;
          update("reload-required");
        } else {
          update("disconnected");
          if (!connected) {
            update("unavailable");
            rejectReady(error);
            break;
          }
        }
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            abort.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, delay);
          abort.signal.addEventListener("abort", finish, { once: true });
        });
        delay = Math.min(delay * 2, 5000);
      }
    }
    if (controller === abort) {
      controller = undefined;
      ready = undefined;
    }
  })();
  return ready;
}
export async function listenNode<T>(name: string, listener: (event: { payload: T }) => void): Promise<() => void> {
  const wrapped: Listener = (event) => listener({ payload: event.payload as T });
  const group = listeners.get(name) ?? new Set<Listener>();
  listeners.set(name, group);
  group.add(wrapped);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.delete(wrapped);
    if (!group.size) listeners.delete(name);
    if (!listeners.size) {
      controller?.abort();
      controller = undefined;
      ready = undefined;
      cursor = undefined;
    }
  };
  try {
    await (ready ?? start());
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
