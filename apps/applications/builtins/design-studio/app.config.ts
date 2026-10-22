import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "设计画布",
  defaultEnabled: true,
  permissions: ["application-workspaces", "workspace-files"],
  ui: { title: "设计画布" },
});
