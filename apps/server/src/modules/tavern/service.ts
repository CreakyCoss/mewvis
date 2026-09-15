import * as fs from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import {
  root,
  safePath,
  exists,
} from "../../infrastructure/filesystem/paths.js";
import { sessionId } from "../../shared/session-id.js";
import {
  jsonRead,
  jsonOptional,
} from "../../infrastructure/filesystem/json.js";
import { invalid, object, type JsonObject } from "../../shared/validation.js";
import { Serial } from "../../shared/serial.js";

import type { WorkspaceFiles } from "../files/service.js";
export class Tavern {
  private serial = new Serial();
  constructor(
    private dataName: string,
    private files: WorkspaceFiles,
  ) {}
  private async directory(i: JsonObject) {
    const base = await root(i.workspacePath);
    if (!i.runtimePath && i.storyId != null && i.tavernId != null)
      invalid("故事酒馆运行目录必须由调用方传入");
    const input = String(i.runtimePath || `${this.dataName}/tavern`);
    const rel = isAbsolute(input) ? relative(base, input) : input;
    const dir = await safePath(base, rel);
    return { base, dir, rel: relative(base, dir).replaceAll("\\", "/") };
  }
  async load(i: JsonObject) {
    const { dir } = await this.directory(i);
    const index = await jsonOptional(await safePath(dir, "index.json"));
    if (!index || index.version !== 4) return null;
    const rooms: any[] = [],
      messagesByInstance: Record<string, unknown> = {};
    for (const raw of index.roomIds) {
      const id = sessionId(raw),
        folder = await safePath(dir, id);
      if (!(await exists(folder))) continue;
      let room: any;
      try {
        room = await jsonRead(await safePath(folder, "room.json"));
      } catch {
        continue;
      }
      if (!room.id) continue;
      rooms.push(room);
      Object.assign(
        messagesByInstance,
        (await jsonOptional(await safePath(folder, "conversation.json"))) ?? {},
      );
    }
    if (!rooms.length) return null;
    return {
      version: 4,
      activeRoomId: rooms.some((r) => r.id === index.activeRoomId)
        ? index.activeRoomId
        : rooms[0].id,
      rooms,
      messagesByInstance,
    };
  }
  async save(i: JsonObject) {
    return this.serial.run(async () => {
      const state = object(i.state) as any;
      if (!Array.isArray(state.rooms)) invalid("酒馆状态缺少 rooms");
      const messages = object(state.messagesByInstance);
      const { base, dir, rel } = await this.directory(i);
      const ids: string[] = [],
        files: { relativePath: string; content: string }[] = [];
      const add = (path: string, value: unknown) =>
        files.push({
          relativePath: `${rel}/${path}`,
          content: JSON.stringify(value, null, 2),
        });
      for (const room of state.rooms) {
        if (!room.id) continue;
        const id = sessionId(room.id);
        if (ids.includes(id)) invalid("重复酒馆 ID");
        ids.push(id);
        const active = messages[room.activeSceneInstanceId] ?? [];
        const conversation = Object.fromEntries(
          [
            ...new Set([
              room.activeSceneInstanceId,
              ...(room.sceneInstances ?? []).map((v: any) => v.id),
            ]),
          ]
            .filter(
              (id): id is string => typeof id === "string" && id in messages,
            )
            .map((id) => [id, messages[id]]),
        );
        add(`${id}/room.json`, room);
        add(`${id}/messages.json`, active);
        add(`${id}/conversation.json`, conversation);
        add(`${id}/meta.json`, {
          id,
          title: room.title || "未命名酒馆",
          path: `${rel}/${id}/meta.json`,
          workspaceId: room.workspaceId ?? null,
          activeSceneId: room.activeSceneId ?? null,
          activeSceneInstanceId: room.activeSceneInstanceId ?? null,
          activeRunId: room.activeRunId ?? null,
          systemPresetId: room.systemPresetId ?? null,
          locked: room.locked ?? false,
          createdAt: room.createdAt ?? 0,
          updatedAt: room.updatedAt ?? 0,
          messageCount: Array.isArray(active) ? active.length : 0,
        });
      }
      const old = await jsonOptional(await safePath(dir, "index.json"));
      add("index.json", {
        version: 4,
        activeRoomId: state.activeRoomId ?? "",
        roomIds: ids,
      });
      await this.files.atomic({ workspacePath: base, files });
      for (const id of old?.roomIds ?? [])
        if (!ids.includes(id))
          await fs.rm(await safePath(dir, sessionId(id)), {
            recursive: true,
            force: true,
          });
      return state;
    });
  }
  async clear(i: JsonObject) {
    return this.serial.run(async () => {
      const { dir } = await this.directory(i);
      await fs.rm(dir, { recursive: true, force: true });
      return null;
    });
  }
  commands() {
    return {
      load_tavern_state: (i: JsonObject) => this.load(i),
      save_tavern_state: (i: JsonObject) => this.save(i),
      clear_tavern_state: (i: JsonObject) => this.clear(i),
    };
  }
}
