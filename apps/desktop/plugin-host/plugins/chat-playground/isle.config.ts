import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "聊天调试台",
  defaultEnabled: true,
  permissions: ["chat", "workspace-files", "chat-knowledge"],
  agentAccess: {
    filesystem: { read: "all", write: "all" },
    network: { hosts: "all" },
    process: { execute: true },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
  ui: { title: "聊天调试台", layout: "full" },
});
