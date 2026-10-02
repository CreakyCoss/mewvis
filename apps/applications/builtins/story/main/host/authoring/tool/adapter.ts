import { defineTool } from "@mewvis/app-sdk";
import { STORY_TOOL } from "./definition.js";
import { toolSchema } from "../../adapters/schema.js";
import {
  workspaceFields,
  workspaceRequired,
  output,
  type WorkspaceArgs,
} from "../../tools/shared.js";

export const storyTool = defineTool({
  risk: "medium",
  name: "story",
  description:
    "故事创作助手专用的结构化 Story Contract。所有操作绑定当前应用工作区。",
  parameters: {
    ...toolSchema(STORY_TOOL.parameters),
    properties: {
      ...(toolSchema(STORY_TOOL.parameters).properties as object),
      ...workspaceFields,
    },
    required: [...workspaceRequired, "action"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const {
      workspaceId: _id,
      workspacePath,
      ...request
    } = args as WorkspaceArgs & Record<string, unknown>;
    return STORY_TOOL.createImplementation({ workspacePath }).execute(request);
  },
});
