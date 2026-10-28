import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "游戏沙盘",
  icon: "./assets/icon-sandbox.png",
  defaultEnabled: true,
  permissions: [
    "application-data",
    "application-workspaces",
    "workspace-files",
  ],
  agentAccess: {
    filesystem: { read: [], write: [] },
    network: { hosts: [] },
    process: { execute: false },
  },
  ui: { title: "游戏沙盘", layout: "fullscreen", immersive: true },
});
