import * as fs from "node:fs/promises";
import { basename, join, dirname } from "node:path";
import { parse } from "yaml";
import { randomUUID } from "node:crypto";
import type { ConfigDatabase } from "../../storage/config/database.js";
import { extractZip } from "../../infrastructure/filesystem/archive.js";
import { exists, safePath } from "../../infrastructure/filesystem/paths.js";
import { jsonOptional } from "../../infrastructure/filesystem/json.js";
import {
  invalid,
  nonempty,
  object,
  optionalString,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import { Serial } from "../../shared/serial.js";
import { fetchBytes, fetchJson } from "../../infrastructure/network/http.js";

import { recordId } from "../../shared/record-id.js";
export class Skills {
  private serial = new Serial();
  private path: string;
  constructor(
    private db: ConfigDatabase,
    dataDir: string,
    private bundled?: string,
  ) {
    this.path = join(dataDir, "skills");
  }
  private async scan(
    path: string,
    source: string,
    result: any[] = [],
  ): Promise<any[]> {
    if (!(await exists(path))) return result;
    if (await exists(join(path, "SKILL.md"))) {
      if (!(await fs.lstat(join(path, "SKILL.md"))).isFile())
        invalid("SKILL.md 必须是普通文件");
      const content = await fs.readFile(join(path, "SKILL.md"), "utf8");
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
      const meta = block ? (parse(block[1], { maxAliasCount: 20 }) ?? {}) : {};
      const name = typeof meta.name === "string" ? meta.name : basename(path);
      const marker = join(path, ".isle-claw-skill-source");
      if (
        source === "app" &&
        (await exists(marker)) &&
        (await fs.readFile(marker, "utf8")).trim() === "upload"
      )
        source = "upload";
      result.push({
        key: `${source}:${name}`,
        name,
        description: meta.description ?? "",
        content,
        source,
        path,
      });
      return result;
    }
    for (const entry of await fs.readdir(path, { withFileTypes: true }))
      if (entry.isDirectory() && !entry.name.startsWith("."))
        await this.scan(join(path, entry.name), source, result);
    return result;
  }
  async read() {
    const skills = [
      ...(await this.scan(
        this.bundled ?? join(this.path, ".missing"),
        "system",
      )),
      ...(await this.scan(this.path, "app")),
    ].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    );
    const groups: any[] = [];
    for (const skill of skills) {
      if (skill.source === "app") continue;
      const [id, name, order] =
        skill.source === "upload"
          ? ["app-uploaded", "本地上传", 910]
          : ["system-general", "系统技能", 100];
      let g = groups.find((x) => x.id === id);
      if (!g) {
        g = {
          id,
          name,
          description: null,
          order,
          source: skill.source,
          readonly: true,
          isDefault: false,
          skills: [],
        };
        groups.push(g);
      }
      g.skills.push({ key: skill.key });
    }
    const db = this.db.connection;
    for (const row of db
      .prepare(
        'SELECT id,name,description,"order" FROM skill_groups ORDER BY "order"',
      )
      .all()) {
      const members = db
        .prepare("SELECT skill_name FROM skill_group_skills WHERE group_id=?")
        .all(row.id)
        .map(
          (r) =>
            skills.find((s) => s.key === r.skill_name) ??
            skills.find((s) => s.name === r.skill_name),
        )
        .filter(Boolean)
        .map((s) => ({ key: s.key }));
      if (members.length)
        groups.push({
          ...row,
          order: 1000 + Number(row.order),
          source: "custom",
          readonly: false,
          isDefault: false,
          skills: members,
        });
    }
    const requested = db
      .prepare("SELECT value FROM skill_settings WHERE key='default_group_id'")
      .get()?.value;
    const defaultGroupId = groups.some((g) => g.id === requested)
      ? requested
      : "all";
    for (const g of groups) g.isDefault = g.id === defaultGroupId;
    return {
      skills,
      groups: groups.sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name),
      ),
      defaultGroupId,
    };
  }
  async save(i: JsonObject) {
    this.db.transaction(() => {
      const db = this.db.connection,
        now = Date.now();
      if (i.skillGroups != null) {
        if (!Array.isArray(i.skillGroups)) invalid("skillGroups 必须是数组");
        db.exec("DELETE FROM skill_groups");
        let order = 0;
        for (const raw of i.skillGroups) {
          const g = object(raw);
          if (
            g.readonly === true ||
            (g.source != null && g.source !== "" && g.source !== "custom")
          )
            continue;
          const id = recordId(g.id),
            name = nonempty(g.name, "name");
          if (!Array.isArray(g.skills) || !g.skills.length)
            invalid("分组必须至少包含一个技能");
          db.prepare(
            'INSERT INTO skill_groups (id,name,description,"order",created_at,updated_at) VALUES (?,?,?,?,?,?)',
          ).run(
            id,
            name,
            optionalString(g.description, "description") ?? null,
            order++,
            now,
            now,
          );
          for (const key of new Set(
            g.skills.map((v) => nonempty(object(v).key, "key")),
          ))
            db.prepare(
              "INSERT INTO skill_group_skills (group_id,skill_name,disabled,created_at) VALUES (?,?,0,?)",
            ).run(id, key, now);
        }
      }
      if (i.defaultGroupId != null) {
        const value = optionalString(i.defaultGroupId, "defaultGroupId");
        if (value)
          db.prepare(
            "INSERT INTO skill_settings (key,value,updated_at) VALUES ('default_group_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          ).run(value, now);
        else db.exec("DELETE FROM skill_settings WHERE key='default_group_id'");
      }
    });
    return this.read();
  }
  async search(i: JsonObject) {
    // SkillsMP requires a keyword and does not expose a public browse endpoint.
    const query = String(i.query ?? "").trim() || "skill";
    const url = new URL("https://skillsmp.com/api/v1/skills/search");
    url.search = new URLSearchParams({
      q: query,
      limit: String(Math.min(24, Math.max(1, Number(i.limit ?? 12)))),
      page: String(Math.max(1, Number(i.page ?? 1))),
      sortBy: i.sortBy === "updatedAt" ? "recent" : "stars",
    }).toString();
    const response = await fetchJson(url.href);
    if (!response.success)
      throw new ServiceError(502, "MARKETPLACE_ERROR", "SkillsMP 搜索失败");
    return response.data ?? { skills: [], pagination: null };
  }
  async install(i: JsonObject) {
    return this.serial.run(async () => {
      const source = nonempty(i.source, "source");
      await fs.mkdir(this.path, { recursive: true });
      const temp = await fs.mkdtemp(join(this.path, ".install-"));
      let upload = false;
      try {
        if (i.sourceKind === "zip" || source.toLowerCase().endsWith(".zip")) {
          await extractZip(source, temp);
          upload = true;
        } else {
          let value = source;
          if (value.includes("skillsmp.com/"))
            value = (await fetchBytes(value))
              .toString("utf8")
              .replaceAll("&amp;", "&");
          const command = /skills\s+add\s+([^\s"'<>]+)/.exec(value),
            explicit =
              optionalString(i.skillName, "skillName") ??
              /--skill\s+["']?([^\s"'<>]+)/.exec(value)?.[1];
          const candidate =
            command?.[1] ??
            /https:\/\/github\.com\/[^\s"'<>]+/.exec(value)?.[0] ??
            value;
          const url = new URL(candidate);
          if (url.protocol !== "https:" || url.hostname !== "github.com")
            invalid("安装来源必须是 GitHub 或 SkillsMP 链接");
          const [owner, repoRaw, kind, ref, ...tail] = url.pathname
              .split("/")
              .filter(Boolean),
            repo = repoRaw?.replace(/\.git$/, "");
          if (!owner || !repo) invalid("GitHub 链接缺少仓库");
          const base = `https://api.github.com/repos/${owner}/${repo}`;
          const branch =
            kind === "tree" || kind === "blob"
              ? ref
              : (await fetchJson(base)).default_branch;
          const tree = await fetchJson(
            `${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
          );
          if (tree.truncated) invalid("仓库文件列表被截断");
          const desired = tail.join("/").replace(/\/SKILL\.md$/, "");
          let entries = tree.tree.filter(
            (e: any) =>
              e.type === "blob" &&
              (e.path === "SKILL.md" || e.path.endsWith("/SKILL.md")),
          );
          if (desired)
            entries = entries.filter(
              (e: any) =>
                e.path === `${desired}/SKILL.md` ||
                e.path.startsWith(`${desired}/`),
            );
          if (explicit)
            entries = entries.filter(
              (e: any) => basename(dirname(e.path)) === explicit,
            );
          if (entries.length !== 1) invalid("需要指定唯一的 Skill 名称或目录");
          const dir = dirname(entries[0].path);
          const prefix = dir === "." ? "" : dir + "/";
          const files = tree.tree.filter(
            (e: any) => e.type === "blob" && e.path.startsWith(prefix),
          );
          if (
            files.length > 500 ||
            files.reduce((sum: number, e: any) => sum + (e.size ?? 0), 0) >
              50 * 1024 * 1024
          )
            invalid("Skill 超过大小限制");
          let downloaded = 0;
          for (const entry of files) {
            if (entry.mode === "120000") invalid("Skill 不允许符号链接");
            const target = await safePath(
              temp,
              entry.path.slice(prefix.length),
            );
            const bytes = await fetchBytes(
              `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${entry.path.split("/").map(encodeURIComponent).join("/")}`,
              {},
              50 * 1024 * 1024,
            );
            downloaded += bytes.length;
            if (downloaded > 50 * 1024 * 1024) invalid("Skill 超过 50 MiB");
            await fs.mkdir(dirname(target), { recursive: true });
            await fs.writeFile(target, bytes);
          }
        }
        const skills = await this.scan(temp, upload ? "upload" : "app");
        if (skills.length !== 1) invalid("安装包必须包含唯一 Skill");
        const skill = skills[0];
        const name = String(skill.name).replace(/[^\p{L}\p{N}._-]/gu, "-");
        if (!name || name.startsWith(".")) invalid("Skill 名称不合法");
        const dest = join(this.path, name);
        if (await exists(dest))
          throw new ServiceError(
            409,
            "SKILL_EXISTS",
            "Skill 已存在，请先移除或更换名称",
          );
        await fs.writeFile(
          join(skill.path, ".isle-claw-skill-source"),
          upload ? "upload" : "app",
        );
        await fs.rename(skill.path, dest);
        return {
          name: skill.name,
          description: skill.description,
          path: dest,
          sourceUrl: source,
        };
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    });
  }
  async remove(i: JsonObject) {
    return this.serial.run(async () => {
      const skills = await this.scan(this.path, "app");
      const selected = skills.find(
        (s) =>
          (i.key && s.key === i.key) ||
          (i.path && s.path === i.path) ||
          (i.name && s.name === i.name),
      );
      if (!selected)
        throw new ServiceError(
          404,
          "SKILL_NOT_FOUND",
          "没有找到可移除的 Skill",
        );
      await fs.rm(
        await safePath(this.path, selected.path.slice(this.path.length + 1)),
        { recursive: true },
      );
      return { key: selected.key, name: selected.name, path: selected.path };
    });
  }
  commands() {
    return {
      get_skills: () => this.read(),
      save_skills: (i: JsonObject) => this.save(i),
      search_skill_marketplace: (i: JsonObject) => this.search(i),
      install_skill_from_marketplace: (i: JsonObject) => this.install(i),
      remove_app_skill: (i: JsonObject) => this.remove(i),
    };
  }
}
