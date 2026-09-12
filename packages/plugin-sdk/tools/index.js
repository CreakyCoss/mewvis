import { getPluginChatClient } from "../chat/index.js";

export function createPluginToolClient(chat) {
  if (typeof chat?.listTools !== "function")
    throw new Error("当前宿主未提供插件工具目录");
  return Object.freeze({ list: () => chat.listTools() });
}

export function getPluginToolClient() {
  return createPluginToolClient(getPluginChatClient());
}
