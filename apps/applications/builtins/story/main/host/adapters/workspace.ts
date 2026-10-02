import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { MewvisApplicationContext, MewvisToolDefinition } from "@mewvis/app-sdk";

export function bindWorkspaceTools(
  ctx: MewvisApplicationContext,
  tools: readonly MewvisToolDefinition[],
) {
  return tools.map((tool) => ({
    ...tool,
    async execute(args: unknown) {
      if (
        [
          "mewvis_story_types",
          "mewvis_story_skill",
          "mewvis_story_skill_resource",
        ].includes(tool.name)
      )
        return tool.execute(args);
      const input = args as { workspaceId?: unknown } | null;
      if (typeof input?.workspaceId !== "string")
        throw new Error("工作区 ID 无效");
      let workspacePath: string;
      try {
        workspacePath = (await ctx.workspaces!.get(input.workspaceId)).path;
      } catch (error) {
        // The Pi tool worker runs in the host-authorized workspace but has no data connection.
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "CAPABILITY_UNAVAILABLE"
        )
          throw error;
        workspacePath = await realpath(process.cwd());
        const marker = JSON.parse(
          await readFile(
            join(workspacePath, ".mewvis", "workspace.json"),
            "utf8",
          ),
        ) as {
          id?: unknown;
          applications?: unknown;
        };
        if (
          marker.id !== input.workspaceId ||
          !Array.isArray(marker.applications) ||
          !marker.applications.includes("@mewvis/story")
        )
          throw new Error("当前应用未登记在该工作区");
      }
      return tool.execute({ ...input, workspacePath });
    },
  }));
}
