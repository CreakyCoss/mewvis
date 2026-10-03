import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import application from "../dist/mewvis/index.js";

export async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mewvis-workshop-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = {
    id: randomUUID(),
    name: "默认工作区",
    path: root,
    isDefault: true,
  };
  const enrolled = new Map([[base.id, base]]);
  const tools = new Map();
  const skills = new Map();
  const workspaces = {
    async list() {
      return [...enrolled.values()];
    },
    async get(id) {
      if (!enrolled.has(id)) throw new Error("项目未登记");
      return enrolled.get(id);
    },
    async create(input) {
      assert.equal(input.exclusive, true);
      await mkdir(input.path);
      const item = {
        id: randomUUID(),
        name: input.name,
        path: input.path,
        isDefault: false,
      };
      await mkdir(join(input.path, ".mewvis"));
      await writeFile(
        join(input.path, ".mewvis/workspace.json"),
        JSON.stringify({
          version: 1,
          id: item.id,
          applications: ["@mewvis/app-workshop"],
        }),
      );
      enrolled.set(item.id, item);
      return item;
    },
    async remove({ id, deleteContent }) {
      const item = await this.get(id);
      assert.equal(item.isDefault, false);
      enrolled.delete(id);
      if (deleteContent) await rm(item.path, { recursive: true, force: true });
    },
  };
  application.apply({
    tools: {
      register(tool) {
        tools.set(tool.name, tool);
      },
    },
    skills: {
      register(skill) {
        skills.set(skill.name, skill);
      },
    },
    workspaces,
  });
  const run = (name, args = {}) => tools.get(name).execute(args);
  const create = async (name) =>
    (await run("workshop_create_project", { name, description: "测试应用" }))
      .project;
  const write = async (project, path, content) =>
    (
      await run("workshop_write_file", {
        workspaceId: project.id,
        path,
        content,
        baseRevision: project.revision,
      })
    ).project;
  return { root, tools, skills, enrolled, workspaces, run, create, write };
}
