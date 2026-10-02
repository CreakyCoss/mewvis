import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { dump, JSON_SCHEMA, load } from "js-yaml";
import { applicationDirectory } from "./application-paths.js";

// The bundled Node runtime supplies SQLite; keep compatibility with the repository's older Node type package.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (
    path: string,
    options?: { readOnly: boolean },
  ) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...values: string[]): unknown; get(): unknown; all(): Record<string, unknown>[] };
    close(): void;
  };
};

const marker = "$mewvisApplicationSettings";
const absent = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
async function stat(path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error(`迁移拒绝链接：${path}`);
    return info;
  } catch (error) {
    if (absent(error)) return undefined;
    throw error;
  }
}
async function text(path: string) {
  return (await stat(path)) ? readFile(path, "utf8") : undefined;
}
async function entries(path: string) {
  if (!(await stat(path))) return [];
  return (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
}
function parseYaml(source: string, path: string) {
  let value: unknown;
  try {
    value = load(source, { schema: JSON_SCHEMA }) ?? {};
  } catch {
    throw new Error(`应用设置 YAML 无效：${path}`);
  }
  if (!object(value)) throw new Error(`应用设置必须是 YAML 对象：${path}`);
  return value;
}
async function syncDirectory(path: string) {
  if (process.platform === "win32") return;
  const fd = await open(path, "r");
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}
async function durableWrite(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = await open(temporary, "wx", 0o600);
  try {
    await fd.writeFile(content);
    await fd.sync();
  } finally {
    await fd.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

type Move = { from: string; to: string };
type Write = { path: string; before?: string; content: string };
type Plan = {
  version: 1;
  root: string;
  moves: Move[];
  writes: Write[];
  deletes: { path: string; before: string }[];
  workspaces: Move[];
  databases: string[];
  emptyDirectories: string[];
};

/** This runs before any application, SDK connection or session starts. The native caller holds the layout lock. */
export async function migrateApplicationLayout(root: string, applicationIds: readonly string[] = []) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  root = await realpath(root);
  const journalPath = join(root, ".layout-migration.json");
  const journal = await text(journalPath);
  const plan: Plan = journal ? JSON.parse(journal) : await prepare(root, applicationIds);
  if (plan.version !== 1 || plan.root !== root) throw new Error("应用迁移记录与当前数据目录不匹配");
  for (const path of [
    ...plan.moves.flatMap(({ from, to }) => [from, to]),
    ...plan.workspaces.flatMap(({ from, to }) => [from, to]),
    ...plan.writes.map(({ path }) => path),
    ...plan.deletes.map(({ path }) => path),
    ...plan.databases,
    ...plan.emptyDirectories,
  ]) {
    const suffix = relative(root, path);
    if (!isAbsolute(path) || !suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) {
      throw new Error("应用迁移记录包含越界路径");
    }
    for (let parent = dirname(path); parent !== root; parent = dirname(parent)) await stat(parent);
  }
  if (!journal && !plan.moves.length && !plan.writes.length && !plan.deletes.length) {
    await removeEmpty(plan.emptyDirectories);
    return;
  }
  if (!journal) await durableWrite(journalPath, JSON.stringify(plan));

  // File/directory renames preserve IDs, permissions and all workspace files. A journal makes retries idempotent.
  for (const move of plan.moves) {
    const source = await stat(move.from);
    const target = await stat(move.to);
    if (!source && target) continue;
    if (!source || target) throw new Error(`应用迁移目录冲突，已保留数据：${move.from} → ${move.to}`);
    await mkdir(dirname(move.to), { recursive: true, mode: 0o700 });
    await rename(move.from, move.to);
    await syncDirectory(dirname(move.from));
    await syncDirectory(dirname(move.to));
  }
  for (const write of plan.writes) {
    const current = await text(write.path);
    if (current === write.content) continue;
    if ((current === undefined ? undefined : hash(current)) !== write.before) {
      throw new Error(`配置在迁移过程中发生变化，已保留原文件：${write.path}`);
    }
    await durableWrite(write.path, write.content);
    if (!isDeepStrictEqual(parseYaml((await text(write.path))!, write.path), parseYaml(write.content, write.path))) {
      throw new Error(`应用配置迁移核验失败：${write.path}`);
    }
  }
  // Update every owner's registration, including explicitly shared default workspaces.
  for (const path of plan.databases) {
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
      if (db.prepare("SELECT name FROM sqlite_master WHERE name='application_workspaces'").get()) {
        const update = db.prepare("UPDATE application_workspaces SET path = ? WHERE path = ?");
        for (const move of plan.workspaces) update.run(move.to, move.from);
      }
      const checks = db.prepare("PRAGMA quick_check").all();
      if (checks.some((row) => row.quick_check !== "ok")) throw new Error(`应用数据库核验失败：${path}`);
      db.exec("COMMIT");
    } finally {
      db.close();
    }
  }
  for (const item of plan.deletes) {
    const current = await text(item.path);
    if (current === undefined) continue;
    if (hash(current) !== item.before) throw new Error(`旧配置已变化，保留文件：${item.path}`);
    await unlink(item.path);
    await syncDirectory(dirname(item.path));
  }
  await removeEmpty(plan.emptyDirectories);
  await unlink(journalPath);
  await syncDirectory(root);
}

async function removeEmpty(paths: string[]) {
  for (const path of [...new Set(paths)].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(path);
    } catch (error) {
      if (!absent(error) && !["ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
}

async function prepare(root: string, applicationIds: readonly string[]): Promise<Plan> {
  const plan: Plan = {
    version: 1,
    root,
    moves: [],
    writes: [],
    deletes: [],
    workspaces: [],
    databases: [],
    emptyDirectories: [],
  };
  const ids = new Set(applicationIds);
  const legacy = new Map<string, string>();
  const addMove = async (from: string, to: string) => {
    await stat(from);
    for (let parent = dirname(to); parent !== root; parent = dirname(parent)) await stat(parent);
    if ((await stat(to)) || plan.moves.some((move) => move.to === to))
      throw new Error(`应用迁移目标已存在，已保留旧数据：${to}`);
    plan.moves.push({ from, to });
  };
  const discoverLegacy = async (path: string, encoded = "") => {
    for (const entry of await entries(path)) {
      if (!/^(?:[0-9a-f]{2}){1,48}$/.test(entry.name)) continue;
      const child = join(path, entry.name);
      if (!(await stat(child))?.isDirectory()) continue;
      const key = encoded + entry.name;
      const names = new Set((await entries(child)).map((entry) => entry.name));
      if (["storage.sqlite", "workspace"].some((name) => names.has(name))) {
        const id = Buffer.from(key, "hex").toString("utf8");
        if (Buffer.from(id).toString("hex") !== key) throw new Error(`旧应用目录编码无效：${child}`);
        ids.add(id);
        legacy.set(id, child);
      }
      await discoverLegacy(child, key);
      plan.emptyDirectories.push(child);
    }
  };
  await discoverLegacy(join(root, "data"));
  plan.emptyDirectories.push(join(root, "data"), join(root, "packages"));
  for (const entry of await entries(join(root, "packages"))) {
    if (entry.name.startsWith(".")) continue;
    const source = join(root, "packages", entry.name);
    const manifest = JSON.parse((await text(join(source, "package.json"))) ?? "null");
    if (!manifest?.name || typeof manifest.name !== "string") throw new Error(`旧应用包缺少 name：${source}`);
    ids.add(manifest.name);
    await addMove(source, join(applicationDirectory(root, manifest.name), "package"));
  }
  for (const [id, source] of legacy) {
    const destination = applicationDirectory(root, id);
    for (const name of [
      "storage.sqlite",
      "storage.sqlite-wal",
      "storage.sqlite-shm",
      "storage.sqlite-journal",
      "workspace",
    ]) {
      const from = join(source, name),
        to = join(destination, name);
      if (!(await stat(from))) continue;
      await addMove(from, to);
      if (name === "workspace") plan.workspaces.push({ from, to });
    }
  }
  const collectDatabases = async (path: string, deep = false) => {
    for (const entry of await entries(path)) {
      if (!entry.isDirectory() || (deep && !/^(?:[0-9a-f]{2}){1,48}$/.test(entry.name))) continue;
      const child = join(path, entry.name);
      if (deep) await collectDatabases(child, true);
      const db = join(child, "storage.sqlite");
      if (await stat(db)) plan.databases.push(db);
    }
  };
  // Only namespace directories, never workspace contents or dependency trees.
  for (const entry of await entries(root)) {
    if (!entry.isDirectory() || ["data", "packages", "pnpm-store"].includes(entry.name)) continue;
    const child = join(root, entry.name);
    if (entry.name.startsWith("@") || entry.name === ".ids") await collectDatabases(child, entry.name === ".ids");
    else if (await stat(join(child, "storage.sqlite"))) plan.databases.push(join(child, "storage.sqlite"));
  }
  for (const move of plan.moves) {
    if (move.from.endsWith("/storage.sqlite") || move.from.endsWith("\\storage.sqlite")) plan.databases.push(move.to);
  }
  plan.databases = [...new Set(plan.databases)];
  // Check SQLite before changing anything. Runtime writers are not started until migration completes.
  for (const destination of plan.databases) {
    const source = plan.moves.find((move) => move.to === destination)?.from ?? destination;
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      if (
        db
          .prepare("PRAGMA quick_check")
          .all()
          .some((row) => row.quick_check !== "ok")
      )
        throw new Error(`应用数据库损坏，停止迁移：${source}`);
    } finally {
      db.close();
    }
  }

  const sections = new Map<string, unknown>();
  const liveSections = new Set<string>();
  const oldFiles = new Map<string, string>();
  for (const name of ["settings.yaml.pre-namespace-migration.bak", "settings.yaml"]) {
    const path = join(root, name),
      source = await text(path);
    if (source === undefined) continue;
    for (const [namespace, value] of Object.entries(parseYaml(source, path))) sections.set(namespace, value);
    oldFiles.set(path, source);
  }
  // Existing individual sections are authoritative over the old shared file and its backup.
  for (const entry of await entries(root)) {
    if (!entry.isDirectory() || !/^[a-z][a-z0-9-]*$/.test(entry.name)) continue;
    const path = join(root, entry.name, "settings.yaml"),
      source = await text(path);
    if (source === undefined) continue;
    const section = parseYaml(source, path);
    if (section[marker] === 1) continue;
    sections.set(entry.name, section);
    liveSections.add(entry.name);
    oldFiles.set(path, source);
    plan.emptyDirectories.push(dirname(path));
  }
  const documents = new Map<string, Record<string, unknown>>();
  for (const [namespace, value] of sections) {
    const owners = [...ids].filter(
      (id) =>
        id === namespace ||
        id.replace(/^@/, "").replace(/[^a-z0-9]+/g, "-") === namespace ||
        (id === "@mewvis/rss-reader" && namespace === "dsh-rss"),
    );
    if (owners.length > 1) throw new Error(`旧配置 namespace 对应多个应用，停止迁移：${namespace}`);
    if (!owners.length) throw new Error(`无法确定旧配置所属应用，已保留原文件：${namespace}`);
    const owner = owners[0];
    const path = join(applicationDirectory(root, owner), "settings.yaml");
    let document = documents.get(path);
    if (!document) {
      const current = await text(path);
      document = current && !oldFiles.has(path) ? parseYaml(current, path) : { [marker]: 1 };
      if (document[marker] !== 1) throw new Error(`目标配置格式冲突，保留原文件：${path}`);
      documents.set(path, document);
    }
    if (
      Object.hasOwn(document, namespace) &&
      liveSections.has(namespace) &&
      !isDeepStrictEqual(document[namespace], value)
    ) {
      throw new Error(`新旧应用配置冲突，已保留原文件：${namespace}`);
    }
    if (!Object.hasOwn(document, namespace))
      Object.defineProperty(document, namespace, { value, enumerable: true, writable: true, configurable: true });
  }
  for (const [path, document] of documents) {
    const current = await text(path),
      content = dump(document, { schema: JSON_SCHEMA, noRefs: true, lineWidth: 120 });
    if (current !== content)
      plan.writes.push({ path, before: current === undefined ? undefined : hash(current), content });
  }
  for (const [path, source] of oldFiles) if (!documents.has(path)) plan.deletes.push({ path, before: hash(source) });
  return plan;
}
