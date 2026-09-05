const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/** A snapshot mirror, never a second execution engine. */
export function createPluginChatClient(transport) {
  const sessions = new Map();
  const opening = new Map();
  let disposed = false;
  let nextWatch = 0;
  const assertActive = () => {
    if (disposed) throw new Error("聊天连接已关闭");
  };
  const request = (method, handle, input, watchId) => {
    assertActive();
    return transport.request({ method, handle, input, watchId });
  };
  const detach = transport.subscribe((event) =>
    sessions.get(event.handle)?.accept(event),
  );

  function mirror(initial) {
    let snapshot = freeze(structuredClone(initial.snapshot));
    let revision = initial.revision;
    let watchId;
    const listeners = new Set();
    const handle = initial.handle;
    const accept = (event) => {
      if (disposed || event.handle !== handle || event.revision < revision)
        return;
      if (event.watchId && event.watchId !== watchId) return;
      if (event.revision === revision) return;
      revision = event.revision;
      snapshot = freeze(structuredClone(event.snapshot));
      listeners.forEach((listener) => listener());
    };
    const fail = (error) => {
      if (disposed) return;
      snapshot = freeze({
        ...snapshot,
        error: String(error?.message ?? error),
      });
      listeners.forEach((listener) => listener());
    };
    const watch = async () => {
      const current = (watchId = String(++nextWatch));
      try {
        const event = await request("watch", handle, undefined, current);
        if (watchId === current) accept(event);
      } catch (error) {
        if (watchId === current) throw error;
      }
    };
    const call = async (method, input) => {
      try {
        const response = await request(method, handle, input);
        accept(response.event);
        return response.result;
      } catch (error) {
        fail(error);
        if (
          [
            "stop",
            "answer",
            "updateConfig",
            "flush",
            "retrySave",
            "close",
            "setContext",
          ].includes(method)
        )
          return { ok: false, error: String(error?.message ?? error) };
        if (["refreshResources", "retryInitialization"].includes(method))
          return;
        throw error;
      }
    };
    const session = Object.freeze({
      identity: snapshot.identity,
      getSnapshot: () => snapshot,
      subscribe(listener) {
        assertActive();
        listeners.add(listener);
        if (listeners.size === 1) void watch().catch(fail);
        return () => {
          listeners.delete(listener);
          if (disposed || listeners.size || !watchId) return;
          const previous = watchId;
          watchId = undefined;
          void request("unwatch", handle, undefined, previous).catch(() => {});
        };
      },
      send: (input) => call("send", input),
      stop: () => call("stop"),
      answer: (input) => call("answer", input),
      updateConfig: (input) => call("updateConfig", input),
      refreshResources: () => call("refreshResources"),
      retryInitialization: () => call("retryInitialization"),
      flush: () => call("flush"),
      retrySave: () => call("retrySave"),
      close: () => call("close"),
      setContext: (input) => call("setContext", input),
      async reconnect() {
        const event = await request("snapshot", handle);
        // Also clear a local transport error when the host revision hasn't changed.
        if (event.revision === revision) revision--;
        accept(event);
        if (listeners.size) await watch();
      },
    });
    return {
      session,
      accept,
      dispose() {
        listeners.clear();
        watchId = undefined;
      },
    };
  }

  return {
    listWorkspaces: () => request("workspaces"),
    async openSession(input) {
      assertActive();
      const key = JSON.stringify(input);
      if (opening.has(key)) return opening.get(key);
      const pending = request("open", undefined, input)
        .then((event) => {
          assertActive();
          let entry = sessions.get(event.handle);
          if (!entry) {
            entry = mirror(event);
            sessions.set(event.handle, entry);
          } else entry.accept(event);
          return entry.session;
        })
        .finally(() => opening.delete(key));
      opening.set(key, pending);
      return pending;
    },
    dispose() {
      if (disposed) return;
      void transport.request({ method: "detach" }).catch(() => {});
      disposed = true;
      detach();
      sessions.forEach((entry) => entry.dispose());
      sessions.clear();
      opening.clear();
    },
  };
}

let browserClient;
export function getPluginChatClient() {
  if (!browserClient) {
    const transport = globalThis.islePlugin?.chat;
    if (!transport) throw new Error("当前宿主未提供插件聊天能力");
    browserClient = createPluginChatClient(transport);
  }
  return browserClient;
}
