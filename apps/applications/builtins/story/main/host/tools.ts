import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defineTool } from "@isle/app-sdk";
import { storyProjectApi } from "../../shared/project-file.js";
import { storyDocumentIdentityKey } from "../../shared/project/index.js";
import type { StoryDocumentIdentity, StoryValue } from "../../shared/project/types.js";
import { storySkillDefinitions, storySkillResources } from "./story-skills.generated.js";

const workspaceFields = {
  workspaceId: { type: "string", minLength: 1 },
} as const;
const workspaceRequired = ["workspaceId"];
const output = {
  schema: { type: "object" },
  render: (_args: unknown, value: unknown) => [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
};
type WorkspaceArgs = { workspaceId: string; workspacePath: string };

/** The host entry resolves the ID and injects this path after validating public tool arguments. */
const projectPath = (input: WorkspaceArgs) => input.workspacePath;

const snapshot = async (path: string) => {
  const workspace = await storyProjectApi.open(path);
  const [overview, documents, structure, projectContext] = await Promise.all([
    workspace.overview(),
    workspace.listDocuments(),
    workspace.describe(),
    workspace.readContext({ scope: "project" }),
  ]);
  return {
    status: "ready", overview, structure, revision: projectContext.revision,
    documents: documents.map(({ ref, displayName, updatedAt }) => ({ ref, displayName, updatedAt })),
  };
};

const storyTypes = defineTool({
  risk: "low", name: "isle_story_types", description: "列出可创建的故事项目类型。",
  parameters: { type: "object", properties: {}, additionalProperties: false }, output,
  execute: () => ({ types: storyProjectApi.listStoryTypes() }),
});
const skillResource = defineTool({
  risk: "low", name: "isle_story_skill_resource",
  description: "读取内置故事技能引用的参考资料或检查脚本。",
  parameters: {
    type: "object",
    properties: { skillName: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } },
    required: ["skillName", "path"], additionalProperties: false,
  },
  output,
  execute(args) {
    const input = args as { skillName: string; path: string };
    const parts = `${input.skillName}/${input.path}`.replaceAll("\\", "/").split("/");
    const normalized: string[] = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!normalized.pop()) throw new Error("技能资源路径越界");
      } else normalized.push(part);
    }
    const key = normalized.join("/");
    const content = storySkillResources[key];
    if (content === undefined) throw new Error(`故事技能资源不存在：${key}`);
    return { skillName: input.skillName, path: input.path, content };
  },
});
const storySkill = defineTool({
  risk: "low", name: "isle_story_skill",
  description: "列出或加载故事助手的专属工作流技能。开始故事创作任务时先加载 story-assistant，再按其路由加载一个子技能。",
  parameters: {
    type: "object",
    properties: { name: { type: "string" } }, additionalProperties: false,
  },
  output,
  execute(args) {
    const input = args as { name?: string };
    if (!input.name) return {
      skills: storySkillDefinitions.map(({ name, description }) => ({ name, description })),
    };
    const skill = storySkillDefinitions.find(item => item.name === input.name);
    if (!skill) throw new Error(`故事专属技能不存在：${input.name}`);
    return skill;
  },
});
const story = defineTool({
  risk: "medium", name: "story",
  description: "故事创作助手专用的结构化 Story Contract。所有操作绑定当前应用工作区。",
  parameters: {
    type: "object",
    properties: {
      ...workspaceFields,
      action: { type: "string", enum: ["describe_structure", "initialize", "read_context", "validate_changes", "commit_changes"] },
      documentKinds: { type: "array", items: { type: "string" } },
      storyId: { type: "string" }, title: { type: "string" }, storyTypeId: { type: "string" },
      replaceExisting: { type: "boolean" },
      scope: { type: "string", enum: ["project", "chapter"] }, targetId: { type: "string" },
      changeSet: {},
    },
    required: [...workspaceRequired, "action"], additionalProperties: false,
  },
  output,
  async execute(args) {
    const input = args as WorkspaceArgs & {
      action: "describe_structure" | "initialize" | "read_context" | "validate_changes" | "commit_changes";
      documentKinds?: string[]; storyId?: string; title?: string; storyTypeId?: string; replaceExisting?: boolean;
      scope?: "project" | "chapter"; targetId?: string; changeSet?: unknown;
    };
    const path = await projectPath(input);
    if (input.action === "initialize") {
      if (!input.storyId?.trim() || !input.title?.trim()) throw new Error("initialize 需要 storyId 和 title");
      return storyProjectApi.workspace(path).initialize({
        storyId: input.storyId, title: input.title, storyTypeId: input.storyTypeId,
        replaceExisting: input.replaceExisting,
      });
    }
    const workspace = await storyProjectApi.open(path);
    if (input.action === "describe_structure")
      return { available: true, structure: await workspace.describe({ documentKinds: input.documentKinds }) };
    if (input.action === "read_context") {
      if (!input.scope) throw new Error("read_context 需要 scope");
      return workspace.readContext({ scope: input.scope, targetId: input.targetId });
    }
    if (input.action === "validate_changes") return workspace.validateChanges(input.changeSet);
    return workspace.commitChanges(input.changeSet);
  },
});
const inspect = defineTool({
  risk: "low", name: "isle_story_inspect", description: "检查故事工作区兼容性，读取概览、文档和结构。",
  parameters: { type: "object", properties: workspaceFields, required: workspaceRequired, additionalProperties: false }, output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    const compatibility = await storyProjectApi.checkCompatibility(path);
    if (!compatibility.current) {
      const hasDefinition = await lstat(join(path, "story", ".isle-claw", "project.json"))
        .then(() => true, () => false);
      return { status: hasDefinition ? "incompatible" : "empty", compatibility };
    }
    if (compatibility.status !== "compatible") return { status: compatibility.status, compatibility };
    return { ...(await snapshot(path)), compatibility };
  },
});
const create = defineTool({
  risk: "medium", name: "isle_story_create", description: "在已登记的应用工作区中创建标准故事项目。",
  parameters: { type: "object", properties: { ...workspaceFields, title: { type: "string", minLength: 1, maxLength: 200 }, storyTypeId: { type: "string", minLength: 1 } }, required: [...workspaceRequired, "title", "storyTypeId"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { title: string; storyTypeId: string };
    const path = await projectPath(input);
    const compatibility = await storyProjectApi.checkCompatibility(path);
    if (compatibility.current || await lstat(join(path, "story", ".isle-claw", "project.json"))
      .then(() => true, () => false)) throw new Error("该工作区已有故事项目");
    await storyProjectApi.create(path, { storyTypeId: input.storyTypeId, storyId: input.workspaceId, title: input.title.trim() });
    return snapshot(path);
  },
});
const save = defineTool({
  risk: "medium", name: "isle_story_save_document", description: "保存故事项目文档并返回更新后的项目快照。",
  parameters: { type: "object", properties: { ...workspaceFields, ref: { type: "object" }, value: {} }, required: [...workspaceRequired, "ref", "value"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { ref: StoryDocumentIdentity; value: StoryValue };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    await workspace.saveDocument({ ref: input.ref, value: input.value });
    return snapshot(path);
  },
});
const getDocument = defineTool({
  risk: "low", name: "isle_story_get_document", description: "读取指定故事文档的完整内容与字段定义。",
  parameters: { type: "object", properties: { ...workspaceFields, ref: { type: "object" } }, required: [...workspaceRequired, "ref"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { ref: StoryDocumentIdentity };
    const path = await projectPath(input);
    const document = (await (await storyProjectApi.open(path)).listDocuments())
      .find(item => storyDocumentIdentityKey(item.ref) === storyDocumentIdentityKey(input.ref));
    if (!document) throw new Error("故事文档不存在");
    return { document };
  },
});
const remove = defineTool({
  risk: "medium", name: "isle_story_remove_document", description: "移除故事项目中的一份文档。",
  parameters: { type: "object", properties: { ...workspaceFields, ref: { type: "object" } }, required: [...workspaceRequired, "ref"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { ref: StoryDocumentIdentity };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    await workspace.removeDocument(input.ref);
    return snapshot(path);
  },
});
const upgrade = defineTool({
  risk: "medium", name: "isle_story_upgrade", description: "将已登记故事项目升级到当前格式。",
  parameters: { type: "object", properties: workspaceFields, required: workspaceRequired, additionalProperties: false }, output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    const result = await storyProjectApi.upgrade(path);
    return { result, ...(result.compatibility.status === "compatible" ? await snapshot(path) : {}) };
  },
});
const context = defineTool({
  risk: "low", name: "isle_story_read_context", description: "按项目或章节读取标准故事上下文，供创作助手使用。",
  parameters: { type: "object", properties: { ...workspaceFields, scope: { type: "string", enum: ["project", "chapter"] }, targetId: { type: "string" } }, required: [...workspaceRequired, "scope"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { scope: "project" | "chapter"; targetId?: string };
    const path = await projectPath(input);
    return { context: await (await storyProjectApi.open(path)).readContext({ scope: input.scope, targetId: input.targetId }) };
  },
});
const tavernContext = defineTool({
  risk: "low", name: "isle_story_tavern_context",
  description: "读取章节酒馆所需的定向故事上下文和相关角色资料。",
  parameters: {
    type: "object",
    properties: { ...workspaceFields, chapterId: { type: "string", minLength: 1 } },
    required: [...workspaceRequired, "chapterId"], additionalProperties: false,
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
    const relevant = new Set(chapterContext.sources
      .filter(source => source.kind === characterKind)
      .map(source => storyDocumentIdentityKey(source.ref)));
    const characters = documents
      .filter(document => document.ref.kind === characterKind && relevant.has(storyDocumentIdentityKey(document.ref)))
      .map(document => document.value)
      .filter((value): value is Record<string, StoryValue> => !!value && typeof value === "object" && !Array.isArray(value))
      .map(value => ({
        id: typeof value.id === "string" ? value.id : "",
        name: typeof value.name === "string" ? value.name : "未命名角色",
        avatar: typeof value.avatar === "string" ? value.avatar : "",
        description: typeof value.description === "string" ? value.description : "",
        speakingStyle: typeof value.speakingStyle === "string" ? value.speakingStyle : "",
        writingStyle: typeof value.writingStyle === "string" ? value.writingStyle : "",
        replyStylePrompt: typeof value.replyStylePrompt === "string" ? value.replyStylePrompt : "",
        goals: typeof value.goals === "string" ? value.goals : "",
        relationshipSummary: typeof value.relationshipSummary === "string" ? value.relationshipSummary : "",
        publicRelationshipSummary: typeof value.publicRelationshipSummary === "string" ? value.publicRelationshipSummary : "",
        memory: value.memory && typeof value.memory === "object" && !Array.isArray(value.memory) ? {
          required: typeof value.memory.required === "string" ? value.memory.required : "",
          public: typeof value.memory.public === "string" ? value.memory.public : "",
          known: typeof value.memory.known === "string" ? value.memory.known : "",
          privateSelf: typeof value.memory.privateSelf === "string" ? value.memory.privateSelf : "",
          directorSecret: typeof value.memory.directorSecret === "string" ? value.memory.directorSecret : "",
        } : undefined,
      }));
    return { context: chapterContext, characters };
  },
});
const validateChanges = defineTool({
  risk: "low", name: "isle_story_validate_changes", description: "按原故事协议校验带修订版本的变更集，不写入文件。",
  parameters: { type: "object", properties: { ...workspaceFields, changeSet: {} }, required: [...workspaceRequired, "changeSet"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { changeSet: unknown };
    const path = await projectPath(input);
    return { validation: await (await storyProjectApi.open(path)).validateChanges(input.changeSet) };
  },
});
const commitChanges = defineTool({
  risk: "medium", name: "isle_story_commit_changes", description: "按原故事协议原子提交已校验的变更集。",
  parameters: { type: "object", properties: { ...workspaceFields, changeSet: {} }, required: [...workspaceRequired, "changeSet"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { changeSet: unknown };
    const path = await projectPath(input);
    const workspace = await storyProjectApi.open(path);
    const result = await workspace.commitChanges(input.changeSet);
    return { result, ...(result.committed ? await snapshot(path) : {}) };
  },
});

const tavernFile = async (path: string) => {
  const story = join(path, "story");
  const directory = await lstat(story).catch(() => null);
  if (directory && (!directory.isDirectory() || directory.isSymbolicLink())) throw new Error("故事目录无效");
  const file = join(story, "tavern.json");
  const metadata = await lstat(file).catch(() => null);
  if (metadata && (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 128 * 1024))
    throw new Error("酒馆配置文件无效");
  return file;
};
const readTavern = defineTool({
  risk: "low", name: "isle_story_tavern_read", description: "读取原故事模块使用的 story/tavern.json 酒馆配置。",
  parameters: { type: "object", properties: workspaceFields, required: workspaceRequired, additionalProperties: false }, output,
  async execute(args) {
    const path = await projectPath(args as WorkspaceArgs);
    await storyProjectApi.open(path);
    const file = await tavernFile(path);
    const content = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    return { config: content ? JSON.parse(content) : null };
  },
});
const saveTavern = defineTool({
  risk: "medium", name: "isle_story_tavern_save", description: "保存酒馆配置到原故事模块兼容的 story/tavern.json。",
  parameters: { type: "object", properties: { ...workspaceFields, config: { type: "object" } }, required: [...workspaceRequired, "config"], additionalProperties: false }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { config: Record<string, unknown> };
    const path = await projectPath(input);
    await storyProjectApi.open(path);
    const file = await tavernFile(path);
    if (typeof input.config.title !== "string" || !input.config.title.trim()) throw new Error("酒馆标题不能为空");
    const content = JSON.stringify(input.config, null, 2);
    if (Buffer.byteLength(content) > 128 * 1024) throw new Error("酒馆配置过大");
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

const tavernRoomFile = async (path: string, workspaceId: string, chapterId: string) => {
  const safe = (value: string, fallback: string) => value.trim().replace(/[\\/]/g, "-")
    .replace(/\.\./g, "").replace(/^\.+/, "").trim() || fallback;
  const root = join(path, ".tavern");
  const storyDirectory = join(root, safe(workspaceId, "story"));
  const directory = join(storyDirectory, safe(chapterId, "chapter"));
  for (const candidate of [root, storyDirectory, directory]) {
    const metadata = await lstat(candidate).catch(() => null);
    if (metadata && (!metadata.isDirectory() || metadata.isSymbolicLink())) throw new Error("酒馆消息目录无效");
  }
  const file = join(directory, "messages.json");
  const metadata = await lstat(file).catch(() => null);
  if (metadata && (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 8 * 1024 * 1024))
    throw new Error("酒馆消息文件无效");
  return { directory, file };
};
const readTavernRoom = defineTool({
  risk: "low", name: "isle_story_tavern_room_read", description: "读取原酒馆兼容的章节消息记录。",
  parameters: {
    type: "object", properties: { ...workspaceFields, chapterId: { type: "string", minLength: 1 } },
    required: [...workspaceRequired, "chapterId"], additionalProperties: false,
  }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string };
    const { file } = await tavernRoomFile(await projectPath(input), input.workspaceId, input.chapterId);
    const content = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "[]";
      throw error;
    });
    const messages = JSON.parse(content) as unknown;
    if (!Array.isArray(messages)) throw new Error("酒馆消息格式无效");
    return { messages };
  },
});
const saveTavernRoom = defineTool({
  risk: "medium", name: "isle_story_tavern_room_save", description: "原子保存章节酒馆消息记录。",
  parameters: {
    type: "object", properties: {
      ...workspaceFields, chapterId: { type: "string", minLength: 1 }, messages: { type: "array" },
    }, required: [...workspaceRequired, "chapterId", "messages"], additionalProperties: false,
  }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string; messages: unknown[] };
    const { directory, file } = await tavernRoomFile(await projectPath(input), input.workspaceId, input.chapterId);
    const content = JSON.stringify(input.messages, null, 2);
    if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error("酒馆消息记录过大");
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
  risk: "medium", name: "isle_story_tavern_room_reset", description: "清空指定章节的酒馆消息文件，故事项目内容不受影响。",
  parameters: {
    type: "object", properties: { ...workspaceFields, chapterId: { type: "string", minLength: 1 } },
    required: [...workspaceRequired, "chapterId"], additionalProperties: false,
  }, output,
  async execute(args) {
    const input = args as WorkspaceArgs & { chapterId: string };
    const { file } = await tavernRoomFile(await projectPath(input), input.workspaceId, input.chapterId);
    await rm(file, { force: true });
    return { reset: true };
  },
});

export default [
  storyTypes, storySkill, skillResource, story, inspect, create, getDocument, save, remove, upgrade, context,
  tavernContext, validateChanges, commitChanges, readTavern, saveTavern,
  readTavernRoom, saveTavernRoom, resetTavernRoom,
];
