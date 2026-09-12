import { getApplicationChatClient } from "../chat/index.js";

export function createApplicationToolClient(chat) {
  if (typeof chat?.listTools !== "function")
    throw new Error("当前宿主未提供应用工具目录");
  return Object.freeze({ list: () => chat.listTools() });
}

export function getApplicationToolClient() {
  return createApplicationToolClient(getApplicationChatClient());
}
