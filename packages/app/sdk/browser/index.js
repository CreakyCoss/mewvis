/** Browser entry: the authenticated sandbox supplies the actual transport. */
export function getApplicationHost() {
  const host = globalThis.isleApplication;
  if (!host || host.version !== 1)
    throw new Error(
      "当前页面未连接 Isle 应用宿主，请在 Isle 或应用开发预览中打开",
    );
  return host;
}

export async function writeClipboardText(text) {
  if (typeof text !== "string") throw new Error("复制内容必须是文本");
  const host = globalThis.isleApplication;
  if (host?.writeClipboardText) return host.writeClipboardText(text);
  if (!globalThis.navigator?.clipboard) throw new Error("当前环境不支持剪贴板");
  return globalThis.navigator.clipboard.writeText(text);
}
