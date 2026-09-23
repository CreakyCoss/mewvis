/** Native authoring entry. No SDK, Node, React or concrete Agent is loaded here. */
export function definePlugin(plugin) {
  if (
    !plugin ||
    plugin.protocolVersion !== 1 ||
    typeof plugin.id !== "string" ||
    (typeof plugin.setup !== "function" && typeof plugin.mount !== "function")
  )
    throw new Error("无效的宿主原生插件");
  return plugin;
}
export * from "./agent/index.js";
export * from "./ui/index.js";
export * from "./services/contracts.js";
