/** Browser entry: the authenticated sandbox supplies the actual transport. */
export function getApplicationHost() {
  const host = globalThis.isleApplication;
  if (!host || host.version !== 1)
    throw new Error(
      "当前页面未连接 Isle 应用宿主，请在 Isle 或应用开发预览中打开",
    );
  return host;
}
