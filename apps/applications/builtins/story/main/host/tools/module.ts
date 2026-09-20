import {
  defineTool,
  type IsleApplicationContext,
  type IsleToolDefinition,
} from "@isle/app-sdk";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  storyProjectApi,
  safeWorkspacePath,
  assertNoSymlinks,
} from "../adapters/project-file.js";
import type { StoryWorkspace } from "../../../core/project/index.js";

const output = {
  schema: {},
  render: (_: unknown, value: unknown) => [
    { type: "text" as const, text: JSON.stringify(value ?? null) },
  ],
};
const parameters = {
  type: "object",
  properties: {
    action: { type: "string" },
    workspaceId: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    input: {},
    path: { type: "string" },
    content: { type: "string" },
    deleteContent: { type: "boolean" },
    requireEmpty: { type: "boolean" },
  },
  required: ["action"],
  additionalProperties: false,
};
type Input = {
  action: string;
  workspaceId?: string;
  id?: string;
  name?: string;
  input?: unknown;
  path?: string;
  content?: string;
  deleteContent?: boolean;
  requireEmpty?: boolean;
};
type Record = {
  applicationWorkspaceId?: string;
  id: string;
  name: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
};
const key = (id: string) => `story.library/${id}`;

export function createStoryModuleTools(ctx: IsleApplicationContext) {
  const tools: IsleToolDefinition[] = [];
  const storage = ctx.storage!;
  const workspaces = ctx.workspaces!;
  const get = (id?: string) => {
    if (!id) throw new Error("工作区 ID 无效");
    return workspaces.get(id);
  };
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(run);
    tail = next;
    return next;
  };
  tools.push(
    defineTool({
      name: "isle_story_project",
      description: "原故事模块的项目接口。",
      risk: "medium",
      parameters,
      output,
      async execute(input: Input) {
        const path = (await get(input.workspaceId)).path;
        switch (input.action) {
          case "checkCompatibility":
            return storyProjectApi.checkCompatibility(path);
          case "upgrade":
            return storyProjectApi.upgrade(path);
          case "open":
            await storyProjectApi.open(path);
            return null;
          case "create":
            await storyProjectApi.create(
              path,
              input.input as Parameters<typeof storyProjectApi.create>[1],
            );
            return null;
        }
        const project = storyProjectApi.workspace(path);
        const actions = [
          "initialize",
          "describe",
          "overview",
          "listDocuments",
          "saveDocument",
          "removeDocument",
          "readContext",
          "validateChanges",
          "commitChanges",
        ] as const;
        if (!actions.includes(input.action as (typeof actions)[number]))
          throw new Error("故事操作无效");
        const method = project[
          input.action as Exclude<keyof StoryWorkspace, "projectKey">
        ] as (input?: unknown) => Promise<unknown>;
        return (await method(input.input)) ?? null;
      },
    }),
  );
  tools.push(
    defineTool({
      name: "isle_story_library",
      description: "维护应用自有的故事库。移除记录可选择同时删除故事目录内容。",
      risk: "high",
      parameters,
      output,
      execute: (input: Input) =>
        serial(async () => {
          if (input.action === "list") {
            const records: Record[] = [];
            for (const item of await storage.keys())
              if (item.startsWith("story.library/")) {
                const value = await storage.getItem<Record>(item);
                if (value) {
                  records.push(value);
                }
              }
            return records.sort((a, b) => b.updatedAt - a.updatedAt);
          }
          if (input.action === "add") {
            const workspace = await get(input.workspaceId);
            if (input.requireEmpty) {
              const metadata = await lstat(join(workspace.path, "story")).catch(
                (error: NodeJS.ErrnoException) => {
                  if (error.code === "ENOENT") return null;
                  throw error;
                },
              );
              if (metadata)
                throw new Error("所选目录已经包含故事，请使用导入故事。");
            }
            let prior = await storage.getItem<Record>(key(workspace.id));
            if (!prior)
              for (const item of await storage.keys()) {
                if (!item.startsWith("story.library/")) continue;
                const existing = await storage.getItem<Record>(item);
                if (existing?.workspacePath === workspace.path) {
                  prior = existing;
                  break;
                }
              }
            const now = Date.now();
            const record = {
              ...prior,
              id: prior?.id || workspace.id,
              name: input.name?.trim() || workspace.name,
              workspacePath: workspace.path,
              createdAt: prior?.createdAt ?? now,
              updatedAt: now,
            };
            await storage.setItem(key(record.id), record);
            return record;
          }
          if (!input.id) throw new Error("故事 ID 无效");
          const record = await storage.getItem<Record>(key(input.id));
          if (!record) throw new Error("故事记录不存在");
          if (input.action === "rename") {
            if (!input.name?.trim()) throw new Error("故事名称不能为空");
            const next = {
              ...record,
              name: input.name.trim(),
              updatedAt: Date.now(),
            };
            await storage.setItem(key(input.id), next);
            return next;
          }
          if (input.action === "remove") {
            // The SDK owns membership and shared-workspace deletion semantics.
            try {
              await workspaces.remove({
                id: record.applicationWorkspaceId || input.id,
                deleteContent: input.deleteContent ?? false,
              });
            } catch (error) {
              if (
                input.deleteContent ||
                !(error instanceof Error) ||
                !("code" in error) ||
                error.code !== "WORKSPACE_NOT_FOUND"
              )
                throw error;
            }
            await storage.removeItem(key(input.id));
            return null;
          }
          throw new Error("故事库操作无效");
        }),
    }),
  );
  tools.push(
    defineTool({
      name: "isle_story_file",
      description: "读写原故事模块的酒馆配置和运行文件。",
      risk: "medium",
      parameters,
      output,
      execute: (input: Input) =>
        serial(async () => {
          const workspace = await get(input.workspaceId);
          const path = input.path || "";
          if (
            path !== "story/tavern.json" &&
            !/^\.tavern\/[\w.-]+\/[\w.%\u0080-\uffff -]+\/messages\.json$/.test(
              path,
            )
          )
            throw new Error("不是可访问的酒馆文件");
          await assertNoSymlinks(workspace.path, path);
          const target = safeWorkspacePath(workspace.path, path).target;
          if (input.action === "read") {
            try {
              return { content: await readFile(target, "utf8"), path };
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return null;
              throw error;
            }
          }
          if (input.action === "delete") {
            await rm(target, { force: true });
            return null;
          }
          if (input.action === "write") {
            if (typeof input.content !== "string")
              throw new Error("文件内容无效");
            await mkdir(dirname(target), { recursive: true });
            const temporary = `${target}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporary, input.content, "utf8");
              await rename(temporary, target);
            } finally {
              await rm(temporary, { force: true });
            }
            return null;
          }
          throw new Error("文件操作无效");
        }),
    }),
  );
  return tools;
}
