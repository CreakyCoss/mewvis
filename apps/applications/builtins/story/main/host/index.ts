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
          const workspace = await ctx.workspaces!.get(input.workspaceId);
          return tool.execute({ ...input, workspacePath: workspace.path });
        },
      });
    }
    for (const skill of skills) ctx.skills.register({ ...skill, source: "bundled" });
  },
});
