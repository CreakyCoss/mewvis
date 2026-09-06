import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "聊天调试台",
  defaultEnabled: true,
  permissions: ["chat", "workspace-files", "chat-knowledge"],
  host: { tools: "./main/host/tools.ts" },
  ui: { title: "聊天调试台", layout: "full" },
});
