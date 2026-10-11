import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "影视工坊",
  defaultEnabled: true,
  permissions: ["application-data", "application-workspaces", "chat"],
  agentAccess: {
    filesystem: { read: [], write: [] },
    network: { hosts: [] },
    process: { execute: false },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
  ui: { title: "影视工坊" },
});
