import { defineConfig } from "@isle/app-dev";

export default defineConfig({
  displayName: "故事",
  defaultEnabled: true,
  permissions: ["application-workspaces", "application-data", "chat", "chat-knowledge"],
  agentAccess: {
    filesystem: { read: [{ base: "workspace" }], write: [{ base: "workspace" }] },
    network: { hosts: [] },
    process: { execute: false },
  },
  host: { entry: "./main/host/index.ts" },
  ui: { title: "故事工作台" },
});
