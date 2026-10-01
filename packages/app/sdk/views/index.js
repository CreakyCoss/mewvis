import { getApplicationHost } from "../browser/index.js";

export function mountApplicationView(container, options) {
  const views = getApplicationHost().views;
  if (!views || views.version !== 1)
    throw new Error("当前应用未声明 embedded-views，或宿主不支持内嵌视图");
  return views.mount(container, options);
}

export function getApplicationViewClient() {
  const client = globalThis.isleEmbeddedView;
  if (!client || client.version !== 1)
    throw new Error("当前页面未连接 Isle 内嵌视图宿主");
  return client;
}
