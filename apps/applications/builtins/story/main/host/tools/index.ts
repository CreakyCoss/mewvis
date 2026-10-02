import type { MewvisApplicationContext } from "@mewvis/app-sdk";
import { storyTool } from "../authoring/tool/adapter.js";
import { skillTools } from "../authoring/skills/tools.js";
import { bindWorkspaceTools } from "../adapters/workspace.js";
import { createStoryModuleTools } from "./module.js";
import { projectTools } from "./project.js";
import { tavernTools } from "./tavern.js";

export function createStoryTools(ctx: MewvisApplicationContext) {
  return [
    ...createStoryModuleTools(ctx),
    ...bindWorkspaceTools(ctx, [
      ...projectTools,
      ...skillTools,
      storyTool,
      ...tavernTools,
    ]),
  ];
}
