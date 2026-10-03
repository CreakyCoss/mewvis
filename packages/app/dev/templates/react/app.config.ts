import { defineConfig } from "@mewvis/app-dev";

export default defineConfig({
  displayName: "__APPLICATION_NAME__",
  permissions: ["chat", "application-workspaces"],
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
