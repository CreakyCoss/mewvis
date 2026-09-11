import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "__PLUGIN_NAME__",
  permissions: ["chat"],
  agentAccess: {
    filesystem: {
      read: [{ base: "workspace" }, { base: "pluginData" }],
      write: [{ base: "workspace" }, { base: "pluginData" }],
    },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
});
