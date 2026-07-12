import { z } from "zod";
import type { BuiltinToolDefinition, BuiltinToolImplementation, ToolParameterDefinition } from "../../definition.js";
import { createNodeStoryToolRepository } from "./node-repository.js";
import type { StoryToolRepository } from "./repository.js";
import { createStoryToolService } from "./service.js";
import { STORY_TOOL_ACTIONS, STORY_TOOL_CONTRACT, type StoryToolRequest, type StoryToolApi } from "../protocol.js";

export const STORY_TOOL_NAME = "story" as const;

const storyToolRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal(STORY_TOOL_ACTIONS.describeStructure) }).strict(),
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.initialize),
      storyId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      replaceExistingJson: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.readContext),
      scope: z.enum(["project", "chapter"]),
      targetId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.validateChanges),
      changeSet: z.unknown(),
    })
    .strict(),
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.commitChanges),
      changeSet: z.unknown(),
    })
    .strict(),
]);

export type StoryToolPackage = BuiltinToolImplementation<StoryToolApi> &
  Readonly<{
    id: "novel-claw.story";
  }>;

export const createStoryToolPackage = (repository: StoryToolRepository): StoryToolPackage => {
  const api = createStoryToolService(repository);
  return {
    id: "novel-claw.story",
    api,
    execute: async (input) => {
      const request = storyToolRequestSchema.parse(input) as StoryToolRequest;
      switch (request.action) {
        case STORY_TOOL_ACTIONS.describeStructure:
          return api.describeStructure();
        case STORY_TOOL_ACTIONS.initialize:
          return api.initialize(request);
        case STORY_TOOL_ACTIONS.readContext:
          return api.readContext(request);
        case STORY_TOOL_ACTIONS.validateChanges:
          return api.validateChanges(request);
        case STORY_TOOL_ACTIONS.commitChanges:
          return api.commitChanges(request);
      }
    },
  };
};

const literalParam = (value: string) => ({ type: "literal", value }) as const;
const optionalString = (description: string) => ({ type: "string", description, optional: true }) as const;

const STORY_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    action: {
      type: "union",
      description: "要执行的故事操作",
      anyOf: Object.values(STORY_TOOL_ACTIONS).map(literalParam),
    },
    storyId: optionalString("initialize 时必填：故事稳定 ID"),
    title: optionalString("initialize 时必填：故事标题"),
    replaceExistingJson: {
      type: "boolean",
      description: "initialize 时可选；是否替换 story 目录中已有的普通 JSON，默认 false",
      optional: true,
    },
    scope: {
      type: "union",
      description: "read_context 时必填：读取项目摘要或章节上下文",
      anyOf: [literalParam("project"), literalParam("chapter")],
      optional: true,
    },
    targetId: optionalString("read_context 且 scope=chapter 时必填：章节计划 ID 或章节号"),
    changeSet: {
      type: "json",
      description: "validate_changes 或 commit_changes 时必填：小批次 Story ChangeSet JSON 对象",
      optional: true,
    },
  },
} as const satisfies ToolParameterDefinition;

export const STORY_TOOL = Object.freeze({
  name: STORY_TOOL_NAME,
  label: "Story",
  contract: STORY_TOOL_CONTRACT,
  description:
    "Read and modify a structured story through a trusted StoryContractCompiler. This tool implements the versioned story project tool contract and always verifies its fixed story contract requirements before exposing describe_structure, initialize, read_context, validate_changes, and atomic commit_changes.",
  parameters: STORY_TOOL_PARAMETERS,
  createImplementation: ({ workspacePath }) => createStoryToolPackage(createNodeStoryToolRepository(workspacePath)),
}) satisfies BuiltinToolDefinition<typeof STORY_TOOL_CONTRACT>;
