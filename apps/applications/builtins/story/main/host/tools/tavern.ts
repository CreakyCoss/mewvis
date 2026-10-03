import { productId } from "@mewvis/product-config";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defineTool } from "@mewvis/app-sdk";
import { storyProjectApi } from "../adapters/project-file.js";
import { storyDocumentIdentityKey } from "../../../core/project/index.js";
import type { StoryValue } from "../../../core/project/types.js";
import {
  workspaceFields,
  workspaceRequired,
  output,
  projectPath,
  type WorkspaceArgs,
} from "./shared.js";

const tavernContext = defineTool({
  risk: "low",
  name: productId("_story_tavern_context"),
  description: "读取章节酒馆所需的定向故事上下文和相关角色资料。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      chapterId: { type: "string", minLength: 1 },
    },
    required: [...workspaceRequired, "chapterId"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string };
    const workspace = await storyProjectApi.open(await projectPath(input));
    const [chapterContext, structure, documents] = await Promise.all([
      workspace.readContext({ scope: "chapter", targetId: input.chapterId }),
      workspace.describe(),
      workspace.listDocuments(),
    ]);
    if (chapterContext.target?.id !== input.chapterId)
      throw new Error(`章节上下文目标不一致：${input.chapterId}`);
    const characterKind = structure.roles.character;
    const relevant = new Set(
      chapterContext.sources
        .filter((source) => source.kind === characterKind)
        .map((source) => storyDocumentIdentityKey(source.ref)),
    );
    const characters = documents
      .filter(
        (document) =>
          document.ref.kind === characterKind &&
          relevant.has(storyDocumentIdentityKey(document.ref)),
      )
      .map((document) => document.value)
      .filter(
        (value): value is Record<string, StoryValue> =>
          !!value && typeof value === "object" && !Array.isArray(value),
      )
      .map((value) => ({
        id: typeof value.id === "string" ? value.id : "",
        name: typeof value.name === "string" ? value.name : "未命名角色",
        avatar: typeof value.avatar === "string" ? value.avatar : "",
        description:
          typeof value.description === "string" ? value.description : "",
        speakingStyle:
          typeof value.speakingStyle === "string" ? value.speakingStyle : "",
        writingStyle:
          typeof value.writingStyle === "string" ? value.writingStyle : "",
        replyStylePrompt:
          typeof value.replyStylePrompt === "string"
            ? value.replyStylePrompt
            : "",
        goals: typeof value.goals === "string" ? value.goals : "",
        relationshipSummary:
          typeof value.relationshipSummary === "string"
            ? value.relationshipSummary
            : "",
        publicRelationshipSummary:
          typeof value.publicRelationshipSummary === "string"
            ? value.publicRelationshipSummary
            : "",
        memory:
          value.memory &&
          typeof value.memory === "object" &&
          !Array.isArray(value.memory)
            ? {
                required:
                  typeof value.memory.required === "string"
                    ? value.memory.required
                    : "",
                public:
                  typeof value.memory.public === "string"
                    ? value.memory.public
                    : "",
                known:
                  typeof value.memory.known === "string"
                    ? value.memory.known
                    : "",
                privateSelf:
                  typeof value.memory.privateSelf === "string"
                    ? value.memory.privateSelf
                    : "",
                directorSecret:
                  typeof value.memory.directorSecret === "string"
                    ? value.memory.directorSecret
                    : "",
              }
            : undefined,
      }));
    return { context: chapterContext, characters };
  },
});
const tavernFile = async (path: string) => {
  const story = join(path, "story");
  const directory = await lstat(story).catch(() => null);
  if (directory && (!directory.isDirectory() || directory.isSymbolicLink()))
    throw new Error("故事目录无效");
  const file = join(story, "tavern.json");
  const metadata = await lstat(file).catch(() => null);
  if (
    metadata &&
    (!metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > 128 * 1024)
  )
    throw new Error("酒馆配置文件无效");
  return file;
};
const readTavern = defineTool({
  risk: "low",
  name: productId("_story_tavern_read"),
  description: "读取原故事模块使用的 story/tavern.json 酒馆配置。",
  parameters: {
    type: "object",
    properties: workspaceFields,
    required: workspaceRequired,
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    await storyProjectApi.open(path);
    const file = await tavernFile(path);
    const content = await readFile(file, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    return { config: content ? JSON.parse(content) : null };
  },
});
const saveTavern = defineTool({
  risk: "medium",
  name: productId("_story_tavern_save"),
  description: "保存酒馆配置到原故事模块兼容的 story/tavern.json。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, config: { type: "object" } },
    required: [...workspaceRequired, "config"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { config: Record<string, unknown> };
    const path = await projectPath(input);
    await storyProjectApi.open(path);
    const file = await tavernFile(path);
    if (typeof input.config.title !== "string" || !input.config.title.trim())
      throw new Error("酒馆标题不能为空");
    const content = JSON.stringify(input.config, null, 2);
    if (Buffer.byteLength(content) > 128 * 1024)
      throw new Error("酒馆配置过大");
    await mkdir(join(path, "story"), { recursive: true });
    const staged = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(staged, content, "utf8");
      await rename(staged, file);
    } finally {
      await rm(staged, { force: true });
    }
    return { config: input.config };
  },
});

const tavernRoomFile = async (
  path: string,
  workspaceId: string,
  chapterId: string,
) => {
  const safe = (value: string, fallback: string) =>
    value
      .trim()
      .replace(/[\\/]/g, "-")
      .replace(/\.\./g, "")
      .replace(/^\.+/, "")
      .trim() || fallback;
  const root = join(path, ".tavern");
  const storyDirectory = join(root, safe(workspaceId, "story"));
  const directory = join(storyDirectory, safe(chapterId, "chapter"));
  for (const candidate of [root, storyDirectory, directory]) {
    const metadata = await lstat(candidate).catch(() => null);
    if (metadata && (!metadata.isDirectory() || metadata.isSymbolicLink()))
      throw new Error("酒馆消息目录无效");
  }
  const file = join(directory, "messages.json");
  const metadata = await lstat(file).catch(() => null);
  if (
    metadata &&
    (!metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > 8 * 1024 * 1024)
  )
    throw new Error("酒馆消息文件无效");
  return { directory, file };
};
const readTavernRoom = defineTool({
  risk: "low",
  name: productId("_story_tavern_room_read"),
  description: "读取原酒馆兼容的章节消息记录。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      chapterId: { type: "string", minLength: 1 },
    },
    required: [...workspaceRequired, "chapterId"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string };
    const { file } = await tavernRoomFile(
      await projectPath(input),
      input.workspaceId,
      input.chapterId,
    );
    const content = await readFile(file, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "[]";
        throw error;
      },
    );
    const messages = JSON.parse(content) as unknown;
    if (!Array.isArray(messages)) throw new Error("酒馆消息格式无效");
    return { messages };
  },
});
const saveTavernRoom = defineTool({
  risk: "medium",
  name: productId("_story_tavern_room_save"),
  description: "原子保存章节酒馆消息记录。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      chapterId: { type: "string", minLength: 1 },
      messages: { type: "array" },
    },
    required: [...workspaceRequired, "chapterId", "messages"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & {
      chapterId: string;
      messages: unknown[];
    };
    const { directory, file } = await tavernRoomFile(
      await projectPath(input),
      input.workspaceId,
      input.chapterId,
    );
    const content = JSON.stringify(input.messages, null, 2);
    if (Buffer.byteLength(content) > 8 * 1024 * 1024)
      throw new Error("酒馆消息记录过大");
    await mkdir(directory, { recursive: true });
    const staged = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(staged, content, "utf8");
      await rename(staged, file);
    } finally {
      await rm(staged, { force: true });
    }
    return { saved: true, count: input.messages.length };
  },
});
const resetTavernRoom = defineTool({
  risk: "medium",
  name: productId("_story_tavern_room_reset"),
  description: "清空指定章节的酒馆消息文件，故事项目内容不受影响。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      chapterId: { type: "string", minLength: 1 },
    },
    required: [...workspaceRequired, "chapterId"],
    additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string };
    const { file } = await tavernRoomFile(
      await projectPath(input),
      input.workspaceId,
      input.chapterId,
    );
    await rm(file, { force: true });
    return { reset: true };
  },
});

export const tavernTools = [
  tavernContext,
  readTavern,
  saveTavern,
  readTavernRoom,
  saveTavernRoom,
  resetTavernRoom,
];
