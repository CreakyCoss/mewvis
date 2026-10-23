import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "口袋文明",
  icon: "./assets/icon.webp",
  defaultEnabled: true,
  permissions: ["application-data", "application-workspaces", "chat"],
  agentAccess: {
    filesystem: { read: [], write: [] },
    network: { hosts: [] },
    process: { execute: false },
  },
  ui: { title: "口袋文明", layout: "fullscreen", immersive: true },
});
