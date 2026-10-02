// Self-contained: the desktop embeds this factory's source in its audited sandbox
// document. Keep helpers inside the factory so preview and production run the same code.
export function createApplicationViewHost({ getTheme }) {
  const channel = "mewvis-embedded-view-v1";
  const views = new Map();
  const maxMessageBytes = 256 * 1024;
  let disposed = false;

  const json = (value) => {
    const text = JSON.stringify(value, (_key, item) => {
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol" ||
        typeof item === "bigint" ||
        (typeof item === "number" && !Number.isFinite(item))
      )
        throw new Error("内嵌视图通信只接受有限 JSON 数据");
      return item;
    });
    if (
      typeof text !== "string" ||
      new TextEncoder().encode(text).byteLength > maxMessageBytes
    )
      throw new Error("内嵌视图消息超过 256 KiB");
    return JSON.parse(text);
  };
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const methodName = (value) =>
    typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(value);
  const theme = () => {
    const current = getTheme() ?? {};
    return json({
      theme: current.theme === "dark" ? "dark" : "light",
      themeTokens: current.themeTokens ?? {},
    });
  };

  // Also self-contained: only this bootstrap and the supplied browser bundle run
  // in the child. It never receives mewvisApplication or an application data token.
  function childBootstrap(channel, instance, viewId) {
    const pending = new Map();
    const listeners = new Set();
    let nextId = 1;
    let closed = false;
    let host = Object.freeze({ viewId, theme: "light", themeTokens: {} });
    let appliedTokens = [];
    const json = (value) => {
      const text = JSON.stringify(value, (_key, item) => {
        if (
          item === undefined ||
          typeof item === "function" ||
          typeof item === "symbol" ||
          typeof item === "bigint" ||
          (typeof item === "number" && !Number.isFinite(item))
        )
          throw new Error("内嵌视图通信只接受有限 JSON 数据");
        return item;
      });
      if (
        typeof text !== "string" ||
        new TextEncoder().encode(text).byteLength > 256 * 1024
      )
        throw new Error("内嵌视图消息超过 256 KiB");
      return JSON.parse(text);
    };
    const send = (message) =>
      parent.postMessage({ channel, instance, ...message }, "*");
    const close = () => {
      if (closed) return;
      closed = true;
      for (const call of pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error("内嵌视图已关闭"));
      }
      pending.clear();
      listeners.clear();
    };
    const applyTheme = (value) => {
      const root = document.documentElement;
      host = Object.freeze({
        viewId,
        theme: value.theme === "dark" ? "dark" : "light",
        themeTokens: value.themeTokens ?? {},
      });
      root.dataset.theme = host.theme;
      root.classList.toggle("dark", host.theme === "dark");
      appliedTokens.forEach((name) => root.style.removeProperty(name));
      appliedTokens = [];
      Object.entries(host.themeTokens).forEach(([name, value]) => {
        if (
          !/^--[\w-]+$/.test(name) ||
          typeof value !== "string" ||
          !value.trim()
        )
          return;
        root.style.setProperty(name, value);
        appliedTokens.push(name);
      });
      dispatchEvent(new CustomEvent("mewvis:theme", { detail: host.theme }));
    };
    Object.defineProperty(window, "mewvisEmbeddedView", {
      value: Object.freeze({
        version: 1,
        getHost: () => host,
        request(method, params = {}) {
          if (closed) return Promise.reject(new Error("内嵌视图已关闭"));
          if (
            typeof method !== "string" ||
            !/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(method) ||
            !params ||
            typeof params !== "object" ||
            Array.isArray(params)
          )
            return Promise.reject(new Error("内嵌视图请求格式无效"));
          if (pending.size >= 4)
            return Promise.reject(new Error("内嵌视图并发请求过多"));
          let request;
          const id = nextId++;
          try {
            request = json({ type: "request", id, method, params });
          } catch (error) {
            return Promise.reject(error);
          }
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error("内嵌视图请求超时；请重新读取以确认结果"));
            }, 31000);
            pending.set(id, { resolve, reject, timer });
            send(request);
          });
        },
        subscribe(listener) {
          if (closed) throw new Error("内嵌视图已关闭");
          if (typeof listener !== "function")
            throw new Error("监听器必须是函数");
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
      enumerable: true,
    });
    addEventListener("message", (event) => {
      if (event.source !== parent) return;
      const message = event.data;
      if (
        !message ||
        message.channel !== channel ||
        message.instance !== instance ||
        closed
      )
        return;
      if (message.type === "close") {
        close();
        return;
      }
      if (message.type === "theme") {
        applyTheme(message.value);
        return;
      }
      if (message.type === "event") {
        for (const listener of listeners) {
          try {
            listener(json(message.value));
          } catch (error) {
            send({
              type: "error",
              message: String(error?.message ?? error).slice(0, 4096),
            });
          }
        }
        return;
      }
      if (message.type !== "result") return;
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) call.reject(new Error(message.error));
      else call.resolve(message.value);
    });
    addEventListener(
      "pagehide",
      () => {
        send({ type: "unload" });
        close();
      },
      { once: true },
    );
    addEventListener("error", (event) =>
      send({
        type: "error",
        message: String(event.message || "内嵌视图执行失败").slice(0, 4096),
      }),
    );
    addEventListener("unhandledrejection", (event) =>
      send({
        type: "error",
        message: String(
          event.reason?.message ?? event.reason ?? "内嵌视图异步执行失败",
        ).slice(0, 4096),
      }),
    );
  }

  const mount = (container, options) => {
    if (disposed) throw new Error("内嵌视图宿主已关闭");
    if (
      !(container instanceof HTMLElement) ||
      container.ownerDocument !== document ||
      !container.isConnected
    )
      throw new Error("内嵌视图容器必须挂载在当前应用页面中");
    if (
      !object(options) ||
      typeof options.id !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(options.id) ||
      typeof options.title !== "string" ||
      !options.title.trim() ||
      options.title.length > 100
    )
      throw new Error("内嵌视图 ID 或标题无效");
    options = { ...options };
    if (views.has(options.id))
      throw new Error("内嵌视图 ID 已挂载，请先释放旧视图");
    if (views.size >= 4) throw new Error("每个应用页面最多挂载四个内嵌视图");
    if (
      typeof options.script !== "string" ||
      new TextEncoder().encode(options.script).byteLength > 8 * 1024 * 1024 ||
      (options.style !== undefined &&
        (typeof options.style !== "string" ||
          new TextEncoder().encode(options.style).byteLength > 2 * 1024 * 1024))
    )
      throw new Error("内嵌视图需要 JS/CSS 构建产物，大小上限为 8 MiB / 2 MiB");
    if (options.methods !== undefined && !object(options.methods))
      throw new Error("内嵌视图方法必须是白名单对象");
    if (options.onError !== undefined && typeof options.onError !== "function")
      throw new Error("onError 必须是函数");
    const methods = Object.create(null);
    for (const [name, handler] of Object.entries(options.methods ?? {})) {
      if (!methodName(name) || typeof handler !== "function")
        throw new Error("内嵌视图方法名称或处理函数无效");
      methods[name] = handler;
    }
    const instance = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.title = options.title;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    Object.assign(frame.style, {
      display: "block",
      width: "100%",
      height: "100%",
      border: "0",
    });
    const escapeScript = (value) => value.replace(/<\/script/gi, "<\\/script");
    const escapeStyle = (value) => value.replace(/<\/style/gi, "<\\/style");
    const bootstrap = `(${childBootstrap.toString()})(${JSON.stringify(channel)},${JSON.stringify(instance)},${JSON.stringify(options.id)});`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; img-src data: blob:; media-src 'none'; object-src 'none'; font-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>:root{color-scheme:light;font-family:system-ui,sans-serif}:root[data-theme=dark]{color-scheme:dark}html,body{height:100%;margin:0}*{box-sizing:border-box}${escapeStyle(options.style ?? "")}</style></head><body>
<script>${escapeScript(bootstrap)}</script><script>${escapeScript(options.script)}</script>
<script>parent.postMessage({channel:${JSON.stringify(channel)},instance:${JSON.stringify(instance)},type:"ready"},"*");</script></body></html>`;
    const calls = new Map();
    let state = "loading";
    let loads = 0;
    let lastRequestId = 0;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Consumers may use onError instead of awaiting startup; keep that choice safe.
    ready.catch(() => {});
    const post = (message) => {
      if (state !== "closed")
        frame.contentWindow?.postMessage(
          { channel, instance, ...message },
          "*",
        );
    };
    const report = (error) => {
      try {
        options.onError?.(error);
      } catch (callbackError) {
        console.error(callbackError);
      }
    };
    const dispose = () => {
      if (state === "closed") return;
      post({ type: "close" });
      state = "closed";
      clearTimeout(startupTimer);
      rejectReady(new Error("内嵌视图已关闭"));
      for (const call of calls.values()) {
        clearTimeout(call.timer);
        call.controller.abort(new Error("内嵌视图已关闭"));
      }
      calls.clear();
      removeEventListener("message", onMessage);
      frame.removeEventListener("load", onLoad);
      frame.remove();
      views.delete(options.id);
    };
    const onMessage = (event) => {
      if (state === "closed" || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (
        !object(message) ||
        message.channel !== channel ||
        message.instance !== instance
      )
        return;
      if (message.type === "unload") {
        const error = new Error("内嵌视图离开了宿主提供的沙箱文档");
        rejectReady(error);
        dispose();
        report(error);
        return;
      }
      if (message.type === "ready") {
        if (state !== "loading") return;
        state = "ready";
        clearTimeout(startupTimer);
        post({ type: "theme", value: theme() });
        resolveReady();
        return;
      }
      if (message.type === "error") {
        const error = new Error(
          typeof message.message === "string"
            ? message.message.slice(0, 4096)
            : "内嵌视图执行失败",
        );
        if (state === "loading") {
          rejectReady(error);
          dispose();
        }
        report(error);
        return;
      }
      if (message.type !== "request") return;
      const id = message.id;
      if (!Number.isSafeInteger(id) || id < 1) return;
      // Messages from one frame are ordered. Never replay a completed request.
      if (id <= lastRequestId) return;
      lastRequestId = id;
      const reject = (error) => post({ type: "result", id, error });
      let params;
      try {
        json(message);
        if (
          !methodName(message.method) ||
          !Object.hasOwn(methods, message.method)
        )
          throw new Error("内嵌视图未获授权调用该方法");
        if (!object(message.params))
          throw new Error("内嵌视图参数必须是 JSON 对象");
        if (calls.size >= 4) throw new Error("内嵌视图并发请求过多");
        params = json(message.params);
      } catch (error) {
        reject(String(error?.message ?? error));
        return;
      }
      const controller = new AbortController();
      const call = { controller, timer: null };
      const finish = (value, error, failed = false) => {
        if (state === "closed" || calls.get(id) !== call) return;
        calls.delete(id);
        clearTimeout(call.timer);
        if (failed) {
          reject(String(error?.message ?? error).slice(0, 4096));
          return;
        }
        try {
          post({ type: "result", id, value: json(value) });
        } catch (error) {
          reject(String(error?.message ?? error).slice(0, 4096));
        }
      };
      call.timer = setTimeout(() => {
        const error = new Error("内嵌视图请求超时；请重新读取以确认结果");
        controller.abort(error);
        finish(null, error, true);
      }, 30000);
      calls.set(id, call);
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return methods[message.method](
            params,
            Object.freeze({ viewId: options.id, signal: controller.signal }),
          );
        })
        .then(
          (value) => finish(value),
          (error) => finish(null, error, true),
        );
    };
    const onLoad = () => {
      if (++loads <= 1) return;
      const error = new Error("内嵌视图离开了宿主提供的沙箱文档");
      rejectReady(error);
      dispose();
      report(error);
    };
    const startupTimer = setTimeout(() => {
      const error = new Error("内嵌视图启动超时");
      rejectReady(error);
      dispose();
      report(error);
    }, 5000);
    const view = Object.freeze({
      id: options.id,
      get state() {
        return state;
      },
      ready,
      postMessage(value) {
        if (state !== "ready") throw new Error("内嵌视图尚未就绪或已关闭");
        post({ type: "event", value: json(value) });
      },
      dispose,
    });
    views.set(options.id, {
      frame,
      container,
      view,
      updateTheme: () => post({ type: "theme", value: theme() }),
    });
    addEventListener("message", onMessage);
    frame.addEventListener("load", onLoad);
    // WebKit can leave sandboxed Blob navigations on about:blank. srcdoc works
    // in both the desktop WebView and dev preview; allow-scripts without
    // allow-same-origin still gives this document an opaque, isolated origin.
    frame.srcdoc = html;
    try {
      container.append(frame);
    } catch (error) {
      dispose();
      throw error;
    }
    return view;
  };

  const updateTheme = () => views.forEach((entry) => entry.updateTheme());
  const observer = new MutationObserver(() => {
    for (const { frame, container, view } of views.values())
      if (!container.isConnected || !container.contains(frame)) view.dispose();
  });
  // The host can be installed before an embedded document has its root element.
  observer.observe(document, {
    childList: true,
    subtree: true,
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { view } of views.values()) view.dispose();
    observer.disconnect();
    removeEventListener("mewvis:ready", updateTheme);
    removeEventListener("mewvis:theme", updateTheme);
    removeEventListener("pagehide", dispose);
  };
  addEventListener("mewvis:ready", updateTheme);
  addEventListener("mewvis:theme", updateTheme);
  addEventListener("pagehide", dispose, { once: true });
  return Object.freeze({ version: 1, mount, dispose });
}
