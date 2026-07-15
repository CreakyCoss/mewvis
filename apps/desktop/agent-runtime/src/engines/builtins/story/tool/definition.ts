import { z } from "zod";
import type { BuiltinToolDefinition, BuiltinToolImplementation, ToolParameterDefinition } from "../../definition.js";
import { createNodeStoryToolRepository } from "./repository.js";
import type { StoryToolRepository } from "./repository.js";
import { createStoryToolService } from "./service.js";
import { STORY_CHANGE_SET_PARAMETERS } from "./request.js";
import {
  STORY_BUILTIN_IDENTIFIERS,
  STORY_TOOL_ACTIONS,
  STORY_TOOL_CONTRACT,
  type StoryToolRequest,
  type StoryToolApi,
} from "../protocol.js";

export const STORY_TOOL_NAME = "story" as const;

const storyToolRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.describeStructure),
      documentKinds: z.array(z.string().trim().min(1)).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal(STORY_TOOL_ACTIONS.initialize),
      storyId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      storyTypeId: z.string().trim().min(1).optional(),
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
    id: (typeof STORY_BUILTIN_IDENTIFIERS.toolPackage)["id"];
  }>;

export const createStoryToolPackage = (repository: StoryToolRepository): StoryToolPackage => {
  const api = createStoryToolService(repository);
  return {
    id: STORY_BUILTIN_IDENTIFIERS.toolPackage.id,
    api,
    execute: async (input) => {
      const request = storyToolRequestSchema.parse(input) as StoryToolRequest;
      switch (request.action) {
        case STORY_TOOL_ACTIONS.describeStructure:
          return api.describeStructure(request);
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
const optionalStringArray = (description: string) =>
  ({
    type: "array",
    description,
    items: { type: "string", description: "文档 kind" },
    optional: true,
  }) as const;

const STORY_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    action: {
      type: "union",
      description: "要执行的故事操作",
      anyOf: Object.values(STORY_TOOL_ACTIONS).map(literalParam),
    },
    documentKinds: optionalStringArray(
      "describe_structure 时可选：只返回这些文档的完整字段与递归对象定义；省略时返回轻量目录",
    ),
    storyId: optionalString("initialize 时必填：故事稳定 ID"),
    title: optionalString("initialize 时必填：故事标题"),
    storyTypeId: optionalString("initialize 时可选：未配置工作区时选择故事类型，默认 long-novel"),
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
    changeSet: { ...STORY_CHANGE_SET_PARAMETERS, optional: true },
  },
} as const satisfies ToolParameterDefinition;

export const STORY_TOOL = Object.freeze({
  name: STORY_TOOL_NAME,
  label: "Story",
  contract: STORY_TOOL_CONTRACT,
  description:
    "Read and modify a typed story project. It exposes the active document structure, readable writing context, validation, and atomic incremental commits.",
  parameters: STORY_TOOL_PARAMETERS,
  createImplementation: ({ workspacePath }) => createStoryToolPackage(createNodeStoryToolRepository(workspacePath)),
}) satisfies BuiltinToolDefinition<typeof STORY_TOOL_CONTRACT>;
