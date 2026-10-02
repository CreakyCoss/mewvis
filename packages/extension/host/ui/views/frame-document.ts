import { createExtensionHostClient } from "@mewvis/extension-host/services";

/** Only this bootstrap executes before the isolated plugin module is imported. */
export function extensionFrameDocument(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<style>html,body,#root{margin:0;height:100%}body{font:13px/1.6 system-ui,sans-serif;color:var(--foreground);background:var(--background)}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer}button:disabled{cursor:wait;opacity:.6}button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}</style>
</head><body><div id="root"></div><script nonce="${nonce}">
const createHostClient = ${createExtensionHostClient.toString()};
${bootstrap}
</script></body></html>`;
}

const bootstrap = String.raw`
addEventListener("message", function connect(event) {
  if (event.source !== parent || event.data?.type !== "mewvis.extension.connect" || !event.ports[0]) return;
  removeEventListener("message", connect);
  const port = event.ports[0];
  const abort = new AbortController();
  const pending = new Map();
  let sequence = 0, dispose;
  let dialogAvailable = event.data.dialog;
  const hostError = (code, message) => Object.assign(new Error(message), { code });
  function request(method, args, options) {
    if (abort.signal.aborted || options?.signal?.aborted) return Promise.reject(hostError("HOST_CANCELLED", "请求已取消"));
    if (pending.size >= 1) return Promise.reject(hostError("HOST_UNAVAILABLE", "数据请求进行中"));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const cancel = () => {
        const item = pending.get(id);
        if (!item) return;
        item.cleanup(); pending.delete(id);
        port.postMessage({ type: "cancel", id });
        reject(hostError("HOST_CANCELLED", "请求已取消"));
      };
      const timer = method === "ui.dialog.open" || method === "ui.confirm" ? undefined : setTimeout(cancel, 125000);
      options?.signal?.addEventListener("abort", cancel, { once: true });
      pending.set(id, { resolve, reject, cleanup: () => {
        clearTimeout(timer); options?.signal?.removeEventListener("abort", cancel);
      } });
      port.postMessage({ type: "request", id, method, arguments: args });
    });
  }
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const applyTheme = (theme) => {
    for (const [key, value] of Object.entries(theme)) document.documentElement.style.setProperty(key, value);
  };
  port.onmessage = async ({ data }) => {
    if (data.type === "ui.support") dialogAvailable = data.dialog;
    if (data.type === "theme") applyTheme(data.theme);
    if (data.type === "response") {
      const item = pending.get(data.id);
      if (!item) return;
      item.cleanup(); pending.delete(data.id);
      data.error ? item.reject(hostError(data.error.code, data.error.message)) : item.resolve(data.value);
    }
    if (data.type === "dispose") {
      abort.abort();
      for (const item of pending.values()) { item.cleanup(); item.reject(hostError("HOST_CANCELLED", "视图已关闭")); }
      pending.clear();
      try { dispose?.(); } finally { port.close(); }
    }
  };
  port.start();
  const input = event.data;
  applyTheme(input.theme);
  addEventListener("keydown", (event) => {
    if (input.isDialog && event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault(); port.postMessage({ type: "dialog.close" });
    }
  });
  const url = URL.createObjectURL(new Blob([input.source], { type: "text/javascript" }));
  (async () => {
    try {
      const definition = (await import(url)).default;
      if (definition?.id !== input.id || definition?.protocolVersion !== 1 || typeof definition.mount !== "function")
        throw new Error("插件 UI 入口与清单不匹配");
      if (abort.signal.aborted) return;
      dispose = await definition.mount(document.getElementById("root"), Object.freeze({
        contributionId: input.contributionId, viewId: input.viewId, config: freeze(input.config), signal: abort.signal,
        input: freeze(input.input),
        ui: Object.freeze({
          async confirm(args) {
            const trigger = document.activeElement;
            try { return await request("ui.confirm", args); }
            finally { requestAnimationFrame(() => requestAnimationFrame(() => trigger?.focus?.())); }
          },
          dialog: Object.freeze({
          get available() { return dialogAvailable; },
          async open(args) {
            const trigger = document.activeElement;
            try { await request("ui.dialog.open", args); }
            finally { requestAnimationFrame(() => requestAnimationFrame(() => trigger?.focus?.())); }
          },
          close() { if (input.isDialog) port.postMessage({ type: "dialog.close" }); },
          }),
        }),
        services: createHostClient(request, input.capabilities),
      }));
      if (dispose !== undefined && typeof dispose !== "function") throw new Error("插件 mount 必须返回清理函数或空值");
      if (abort.signal.aborted) dispose?.();
      else port.postMessage({ type: "ready" });
    } catch (error) { port.postMessage({ type: "error", message: String(error?.message ?? error) }); }
    finally { URL.revokeObjectURL(url); }
  })();
});
`;
