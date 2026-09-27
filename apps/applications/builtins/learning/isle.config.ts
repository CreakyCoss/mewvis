import { defineConfig } from "@isle/app-dev";

export default defineConfig({
  displayName: "学习工作台",
  defaultEnabled: true,
  permissions: ["chat", "application-workspaces", "application-data"],
  agentAccess: { process: { execute: false } },
  ui: { title: "学习工作台", layout: "full" },
});
