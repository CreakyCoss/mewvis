import { productId } from "@mewvis/product-config";
import type {
  MewvisApplicationContext,
  MewvisToolDefinition,
} from "@mewvis/app-sdk";

export function bindWorkspaceTools(
  ctx: MewvisApplicationContext,
  tools: readonly MewvisToolDefinition[],
) {
  return tools.map((tool) => ({
    ...tool,
    async execute(args: unknown) {
      if (
        new Set<string>([
          productId("_story_types"),
          productId("_story_skill"),
          productId("_story_skill_resource"),
        ]).has(tool.name)
      )
        return tool.execute(args);
      const input = args as { workspaceId?: unknown } | null;
      if (typeof input?.workspaceId !== "string")
        throw new Error("工作区 ID 无效");
      const workspacePath = (await ctx.workspaces!.get(input.workspaceId)).path;
      return tool.execute({ ...input, workspacePath });
    },
  }));
}
