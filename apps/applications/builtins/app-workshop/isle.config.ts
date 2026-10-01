import { defineConfig } from "@isle/app-dev";

export default defineConfig({
  displayName: "应用工坊",
  defaultEnabled: true,
  permissions: [
    "application-workspaces",
    "application-data",
    "workspace-files",
    "chat",
    "embedded-views",
  ],
  agentAccess: {
    filesystem: {
      read: [{ base: "workspace" }],
      write: [{ base: "workspace" }],
    },
    network: { hosts: [] },
    process: { execute: false },
  },
  host: { entry: "./main/host/index.ts" },
  ui: { title: "应用工坊" },
});
