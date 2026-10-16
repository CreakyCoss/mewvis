import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "影视工坊",
  defaultEnabled: true,
  permissions: [
    "application-data",
    "application-workspaces",
    "workspace-files",
    "chat",
  ],
  agentAccess: {
    filesystem: {
      read: [{ base: "workspace" }],
      write: [{ base: "workspace" }],
    },
    network: { hosts: "all" },
    process: { execute: false },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
  ui: { title: "影视工坊" },
});
