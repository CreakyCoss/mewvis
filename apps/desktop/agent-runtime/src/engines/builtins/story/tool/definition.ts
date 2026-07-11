import { z } from "zod";
import type { BuiltinToolDefinition, ToolParameterDefinition } from "../../types.js";
import { STORY_AUTHORING_CONTRACT } from "./contract.js";
import { createNodeStoryProjectRepository } from "./node-repository.js";
import type { StoryProjectRepository } from "./repository.js";
import { createStoryToolService } from "./service.js";
import { STORY_TOOL_ACTIONS, type StoryToolRequest, type StoryToolService } from "./tools.js";

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

export type StoryToolPackage = Readonly<{
  id: "novel-claw.story";
  service: StoryToolService;
  execute(input: unknown): Promise<unknown>;
}>;

export const createStoryToolPackage = (repository: StoryProjectRepository): StoryToolPackage => {
  const service = createStoryToolService(repository);
  return {
    id: "novel-claw.story",
    service,
    execute: async (input) => {
      const request = storyToolRequestSchema.parse(input) as StoryToolRequest;
      switch (request.action) {
        case STORY_TOOL_ACTIONS.describeStructure:
          return service.describeStructure();
        case STORY_TOOL_ACTIONS.initialize:
          return service.initialize(request);
        case STORY_TOOL_ACTIONS.readContext:
          return service.readContext(request);
        case STORY_TOOL_ACTIONS.validateChanges:
          return service.validateChanges(request);
        case STORY_TOOL_ACTIONS.commitChanges:
          return service.commitChanges(request);
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
  capabilities: Object.freeze([STORY_AUTHORING_CONTRACT.capability]),
  description:
    "Read and modify the structured story through the story-authoring contract. describe_structure returns the complete contract; initialize creates it; read_context recalls project or chapter context; validate_changes previews one small ChangeSet; commit_changes validates and atomically persists it. Call describe_structure before the first write. Formal story files must never be edited with ordinary file tools.",
  parameters: STORY_TOOL_PARAMETERS,
  createExecutor: ({ workspacePath }) =>
    createStoryToolPackage(createNodeStoryProjectRepository(workspacePath)).execute,
}) satisfies BuiltinToolDefinition;
