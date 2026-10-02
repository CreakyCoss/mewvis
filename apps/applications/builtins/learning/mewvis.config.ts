import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "学习工坊",
  defaultEnabled: true,
  permissions: ["chat", "application-workspaces", "application-data"],
  agentAccess: { process: { execute: false } },
  ui: { title: "学习工坊" },
});
