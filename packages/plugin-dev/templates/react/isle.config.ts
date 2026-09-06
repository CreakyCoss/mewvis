import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "__PLUGIN_NAME__",
  permissions: ["chat", "workspace-files"],
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
});
