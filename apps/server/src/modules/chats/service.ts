import * as fs from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { join, relative } from "node:path";
import {
  root,
  safePath,
  exists,
  under,
} from "../../infrastructure/filesystem/paths.js";
import { sessionId } from "../../shared/session-id.js";
import {
  jsonRead,
  jsonOptional,
} from "../../infrastructure/filesystem/json.js";
import {
  invalid,
  object,
  nonempty,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import { Serial } from "../../shared/serial.js";

import { recordId } from "../../shared/record-id.js";
import type { WorkspaceFiles } from "../files/service.js";
export class Chats {
  private serial = new Serial();
  constructor(
    private dataName: string,
    private files: WorkspaceFiles,
  ) {}
  private async directory(i: JsonObject) {
    const base = await root(i.workspacePath);
    return { base, dir: await safePath(base, `${this.dataName}/chats`) };
  }
  async list(i: JsonObject) {
    const { dir } = await this.directory(i);
    if (!(await exists(dir))) return [];
    const items: any[] = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const meta = await jsonRead(
          await safePath(dir, `${sessionId(entry.name)}/meta.json`),
        );
        if (meta.id === entry.name) items.push(meta);
      } catch {}
    }
    return items.sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    );
  }
  async load(i: JsonObject): Promise<any> {
    const { dir } = await this.directory(i);
    const id = i.chatId ? sessionId(i.chatId) : (await this.list(i))[0]?.id;
    if (!id) return null;
    const record = await safePath(dir, id);
    if (!(await exists(record))) return null;
    const meta = await jsonRead(await safePath(record, "meta.json"));
    if (meta.id !== id)
      throw new ServiceError(
        409,
        "CHAT_CORRUPT",
        "聊天 ID 与目录不一致，已保留原文件",
      );
    const { path: _path, messageCount: _count, ...fields } = meta;
    return {
      ...fields,
      messages: await jsonRead(await safePath(record, "messages.json")),
      options: await jsonOptional(await safePath(record, "options.json")),
    };
  }
  async save(i: JsonObject) {
    return this.serial.run(async () => {
      const workspaceId = nonempty(i.workspaceId, "workspaceId"),
        origin = object(i.origin);
      if (origin.kind !== "builtin" && origin.kind !== "application")
        invalid("聊天来源无效");
      const expected =
        origin.kind === "builtin"
          ? ["kind", "sceneId"]
          : ["kind", "sceneId", "applicationId"];
      if (Object.keys(origin).some((k) => !expected.includes(k)))
        invalid("聊天来源存在未知字段");
      nonempty(origin.sceneId, "sceneId");
      if (origin.kind === "application")
        nonempty(origin.applicationId, "applicationId");
      if (!("messages" in i)) invalid("messages 必填");
      if (i.isUnread != null && typeof i.isUnread !== "boolean")
        invalid("isUnread 必须是布尔值");
      const id = i.chatId
        ? sessionId(i.chatId)
        : `chat-${Date.now()}-${recordId(undefined)}`;
      const previous = await this.load({ ...i, chatId: id });
      if (
        previous &&
        (previous.workspaceId !== workspaceId ||
          !isDeepStrictEqual(previous.origin, origin))
      )
        throw new ServiceError(
          409,
          "CHAT_ORIGIN_CONFLICT",
          "不能更改已有聊天的工作区或来源",
        );
      const inferred = Array.isArray(i.messages)
        ? (i.messages as any[]).find((m) => m?.role === "user")?.text
        : undefined;
      const title = Array.from(
        String(i.title ?? inferred ?? "新的聊天")
          .trim()
          .split("\n")[0] || "新的聊天",
      )
        .slice(0, 36)
        .join("");
      const now = Date.now();
      const chat = {
        id,
        title,
        workspaceId,
        origin,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        messages: i.messages,
        options: i.options ?? previous?.options ?? null,
        isUnread: i.isUnread ?? false,
      };
      const { base, dir } = await this.directory(i);
      const folder = await safePath(dir, id);
      under(dir, folder);
      const rel = relative(base, folder).replaceAll("\\", "/");
      const meta = {
        ...chat,
        path: `${rel}/meta.json`,
        messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
      } as any;
      delete meta.messages;
      delete meta.options;
      const files = [
        {
          relativePath: `${rel}/messages.json`,
          content: JSON.stringify(chat.messages, null, 2),
        },
        {
          relativePath: `${rel}/meta.json`,
          content: JSON.stringify(meta, null, 2),
        },
      ];
      if (chat.options !== null)
        files.push({
          relativePath: `${rel}/options.json`,
          content: JSON.stringify(chat.options, null, 2),
        });
      await this.files.atomic({
        workspacePath: base,
        files,
        deletePaths: chat.options === null ? [`${rel}/options.json`] : [],
      });
      return chat;
    });
  }
  async unread(i: JsonObject) {
    return this.serial.run(async () => {
      if (typeof i.isUnread !== "boolean") invalid("isUnread 必须是布尔值");
      const { base, dir } = await this.directory(i);
      const path = await safePath(dir, `${sessionId(i.chatId)}/meta.json`);
      const meta = await jsonRead(path);
      meta.isUnread = i.isUnread;
      await this.files.write({
        workspacePath: base,
        relativePath: relative(base, path),
        content: JSON.stringify(meta, null, 2),
      });
      return meta;
    });
  }
  async remove(i: JsonObject) {
    return this.serial.run(async () => {
      const { dir } = await this.directory(i);
      const path = await safePath(dir, sessionId(i.chatId));
      await fs.rm(path, { recursive: true, force: true });
      return this.list(i);
    });
  }
  commands() {
    return {
      list_chats: (i: JsonObject) => this.list(i),
      load_chat: (i: JsonObject) => this.load(i),
      save_chat: (i: JsonObject) => this.save(i),
      set_chat_unread: (i: JsonObject) => this.unread(i),
      delete_chat: (i: JsonObject) => this.remove(i),
    };
  }
}
