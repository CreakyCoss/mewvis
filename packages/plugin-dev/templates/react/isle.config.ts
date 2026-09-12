import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "__PLUGIN_NAME__",
  permissions: ["chat", "plugin-workspaces"],
  agentAccess: {
    filesystem: {
      read: [{ base: "workspace" }],
      write: [{ base: "workspace" }],
    },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
});
