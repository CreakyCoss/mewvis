/** Browser entry: the authenticated sandbox supplies the actual transport. */
export function getPluginHost() {
  const host = globalThis.islePlugin;
  if (!host || host.version !== 1)
    throw new Error(
      "当前页面未连接 Isle 插件宿主，请在 Isle 或插件开发预览中打开",
    );
  return host;
}
