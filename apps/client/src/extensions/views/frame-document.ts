/** Only this bootstrap executes before the isolated plugin module is imported. */
export function extensionFrameDocument(nonce: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;height:100%;font:13px system-ui,sans-serif;color:var(--foreground);background:var(--background)}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer}button:disabled{cursor:wait;opacity:.6}button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}</style>
</head><body><div id="root"></div><script nonce="${nonce}">
${bootstrap}
</script></body></html>`;
}

const bootstrap = String.raw`
addEventListener("message", function connect(event) {
  if (event.source !== parent || event.data?.type !== "isle.extension.connect" || !event.ports[0]) return;
  removeEventListener("message", connect);
  const port = event.ports[0];
  const abort = new AbortController();
  const pending = new Map();
  let sequence = 0, dispose;
  function request(method) {
    if (abort.signal.aborted) return Promise.reject(new Error("视图已关闭"));
    if (pending.size >= 1) return Promise.reject(new Error("数据请求进行中"));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("数据读取超时")); }, 30000);
      pending.set(id, { resolve, reject, timer });
      port.postMessage({ type: "request", id, method });
    });
  }
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  port.onmessage = async ({ data }) => {
    if (data.type === "response") {
      const item = pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(data.id);
      data.error ? item.reject(new Error(data.error)) : item.resolve(data.value);
    }
    if (data.type === "dispose") {
      abort.abort();
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("视图已关闭")); }
      pending.clear();
      try { dispose?.(); } finally { port.close(); }
    }
  };
  port.start();
  const input = event.data;
  for (const [key, value] of Object.entries(input.theme)) document.documentElement.style.setProperty(key, value);
  const url = URL.createObjectURL(new Blob([input.source], { type: "text/javascript" }));
  (async () => {
    try {
      const definition = (await import(url)).default;
      if (definition?.id !== input.id || definition?.apiVersion !== 1 || typeof definition.mount !== "function")
        throw new Error("插件 UI 入口与清单不匹配");
      if (abort.signal.aborted) return;
      dispose = await definition.mount(document.getElementById("root"), Object.freeze({
        contributionId: input.contributionId, viewId: input.viewId, config: freeze(input.config), signal: abort.signal,
        session: Object.freeze({ read: () => request("session.read") }),
      }));
      if (dispose !== undefined && typeof dispose !== "function") throw new Error("插件 mount 必须返回清理函数或空值");
      if (abort.signal.aborted) dispose?.();
      else port.postMessage({ type: "ready" });
    } catch (error) { port.postMessage({ type: "error", message: String(error?.message ?? error) }); }
    finally { URL.revokeObjectURL(url); }
  })();
});
`;
