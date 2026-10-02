import { defineConfig } from "@isle/app-dev";

export default defineConfig({
  displayName: "调试台",
  defaultEnabled: true,
  permissions: ["chat", "workspace-files", "chat-knowledge", "application-workspaces", "application-data"],
  agentAccess: {
    filesystem: { read: "all", write: "all" },
    network: { hosts: "all" },
    process: { execute: true },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
  ui: { title: "调试台" },
});
