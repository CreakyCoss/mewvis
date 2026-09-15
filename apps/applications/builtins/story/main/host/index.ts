import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { defineApplication } from "@isle/app-sdk";
import tools from "./tools.js";
import skills from "./skills.js";

export default defineApplication({
  name: "@isle/story",
  inject: ["tools", "skills", "workspaces"],
  apply(ctx) {
    if (!ctx.workspaces) throw new Error("故事应用需要应用工作区服务");
    for (const tool of tools) {
      ctx.tools.register({
        ...tool,
        async execute(args: unknown) {
          if (tool.name === "isle_story_types") return tool.execute(args);
          const input = args as { workspaceId?: unknown } | null;
          if (typeof input?.workspaceId !== "string") throw new Error("工作区 ID 无效");
          let workspacePath: string;
          try {
            workspacePath = (await ctx.workspaces!.get(input.workspaceId)).path;
          } catch (error) {
            // The Pi tool worker runs in the host-authorized workspace but has no data connection.
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== "CAPABILITY_UNAVAILABLE")
              throw error;
            workspacePath = await realpath(process.cwd());
            const marker = JSON.parse(await readFile(join(workspacePath, ".isle", "workspace.json"), "utf8")) as {
              id?: unknown; applications?: unknown;
            };
            if (marker.id !== input.workspaceId || !Array.isArray(marker.applications) || !marker.applications.includes("@isle/story"))
              throw new Error("当前应用未登记在该工作区");
          }
          return tool.execute({ ...input, workspacePath });
        },
      });
    }
    for (const skill of skills) ctx.skills.register({ ...skill, source: "bundled" });
  },
});
