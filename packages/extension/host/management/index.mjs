import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { Ajv } from "ajv";
import manifestSchema from "../manifest.schema.json" with { type: "json" };

import uiContributionSchema from "../ui/protocol/contribution.schema.json" with { type: "json" };

const ajv = new Ajv({ allErrors: true });
ajv.addSchema(uiContributionSchema);
const validateManifest = ajv.compile(manifestSchema);
const idPattern = "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$";
const risks = {
  type: "object",
  additionalProperties: { enum: ["low", "medium", "high"] },
};
const fields = {
  path: { type: "string", minLength: 1 },
  enabled: { type: "boolean" },
  config: { type: "object" },
  toolRisks: risks,
  commandRisks: risks,
};
const { path: _path, ...overrideFields } = fields;
const validateRegistration = ajv.compile({
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: fields,
});
const validateSettings = ajv.compile({
  type: "object",
  required: ["version", "packages"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    bundled: {
      type: "object",
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: overrideFields,
      },
    },
    packages: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "path", "enabled"],
        additionalProperties: false,
        properties: { ...fields, id: { type: "string", pattern: idPattern } },
      },
    },
  },
});
function assertValid(validate, value, label) {
  if (!validate(value))
    throw new Error(`${label}：${ajv.errorsText(validate.errors)}`);
}
function jsonClone(value) {
  const ancestors = new Set();
  const check = (item) => {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || ancestors.has(item))
      throw new Error("插件配置必须为有限、无循环的 JSON 数据");
    if (
      !Array.isArray(item) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(item))
    )
      throw new Error("插件配置必须为 JSON 对象");
    ancestors.add(item);
    for (const child of Object.values(item)) check(child);
    ancestors.delete(item);
  };
  check(value);
  return structuredClone(value);
}
function absolute(path) {
  if (typeof path !== "string" || !isAbsolute(path))
    throw new Error("插件路径必须为绝对路径");
  return path;
}
function contained(root, path) {
  const rel = relative(root, path);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  )
    throw new Error("插件入口必须位于包内");
  return path;
}
export function resolveExtensionConfig(manifest, input = {}) {
  const config = jsonClone({
    ...manifest.configuration?.defaults,
    ...jsonClone(input),
  });
  if (manifest.configuration)
    assertValid(
      new Ajv({ allErrors: true }).compile(manifest.configuration.schema),
      config,
      "插件配置无效",
    );
  else if (Object.keys(config).length) throw new Error("插件未声明配置 schema");
  return config;
}

/** Metadata-only: never import plugin code in the package manager or main host. */
export function readExtensionPackage(
  path,
  { checkEntry = true, module, decode = (value) => value } = {},
) {
  const root = realpathSync(absolute(path));
  const manifestPath = contained(
    root,
    realpathSync(resolve(root, "package.json")),
  );
  const packageJson = decode(JSON.parse(readFileSync(manifestPath, "utf8")));
  assertValid(validateManifest, packageJson, "插件清单无效或能力尚不支持");
  const manifest = packageJson["isle.plugin"];
  const modules = {};
  const paths = new Set();
  for (const [kind, declaration] of Object.entries(manifest.modules)) {
    const path = declaration.entry;
    if (path === undefined) {
      modules[kind] = { ...declaration };
      continue;
    }
    if (isAbsolute(path) || path.includes("\\") || !/\.m?js$/.test(path))
      throw new Error("插件入口必须为包内相对 ESM .js/.mjs 路径");
    let entry = contained(root, resolve(root, path));
    if (checkEntry && (!module || module === kind)) {
      entry = contained(root, realpathSync(entry));
      if (!statSync(entry).isFile()) throw new Error("插件入口不是文件");
    }
    if (paths.has(entry)) throw new Error("不同插件模块不能共享入口文件");
    paths.add(entry);
    modules[kind] = { ...declaration, entry };
  }
  if (
    modules.ui &&
    new Set(modules.ui.contributions.map((panel) => panel.id)).size !==
      modules.ui.contributions.length
  )
    throw new Error("插件 UI 贡献 ID 重复");
  for (const action of modules.ui?.contributions.filter((item) => item.type === "action") ?? []) {
    if (!modules.ui.contributions.some((item) =>
      item.id === action.trigger.id && item.type === "dialog" && item.slot === "session.dialog",
    )) throw new Error(`操作入口 ${action.id} 必须指向同插件声明的会话弹窗`);
  }
  // Compile schema now, but required configuration may be supplied at registration time.
  if (manifest.configuration)
    new Ajv({ allErrors: true }).compile(manifest.configuration.schema);
  return { root, modules, manifest, packageJson };
}

export function resolveExtensionPackages(packages) {
  const ids = new Set();
  const sources = [];
  for (const registration of packages) {
    assertValid(validateRegistration, registration, "插件注册信息无效");
    absolute(registration.path);
    if (registration.enabled === false) continue;
    const pkg = readExtensionPackage(registration.path, { module: "agent" });
    const { id } = pkg.manifest;
    if (ids.has(id)) throw new Error(`重复插件：${id}`);
    ids.add(id);
    const config = resolveExtensionConfig(pkg.manifest, registration.config);
    if (!pkg.modules.agent) continue;
    sources.push({
      id,
      entry: pkg.modules.agent.entry,
      capabilities: pkg.modules.agent.capabilities,
      host: pkg.manifest.host,
      config,
      ...(registration.toolRisks && { toolRisks: registration.toolRisks }),
      ...(registration.commandRisks && {
        commandRisks: registration.commandRisks,
      }),
    });
  }
  return sources;
}

export function readExtensionSettings(path) {
  absolute(path);
  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, packages: [] };
    throw error;
  }
  assertValid(validateSettings, document, "插件设置无效");
  const ids = new Set();
  for (const item of document.packages) {
    absolute(item.path);
    if (ids.has(item.id)) throw new Error(`重复插件：${item.id}`);
    ids.add(item.id);
  }
  return document;
}
// Bundled paths are discovered from this installation, never persisted in user settings.
function bundledRecords(bundledPath) {
  if (!bundledPath) return [];
  absolute(bundledPath);
  let entries;
  try {
    entries = readdirSync(bundledPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const pkg = readExtensionPackage(resolve(bundledPath, entry.name), {
        checkEntry: false,
      });
      return {
        id: pkg.manifest.id,
        path: pkg.root,
        enabled: true,
        source: "bundled",
      };
    });
}
function catalog(document, options) {
  const records = [
    ...bundledRecords(options.bundledPath).map((record) => ({
      ...record,
      ...document.bundled?.[record.id],
    })),
    ...document.packages.map((record) => ({ ...record, source: "local" })),
  ];
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`重复插件：${record.id}`);
    ids.add(record.id);
  }
  return records;
}
export function loadExtensionSettingsSources(path, options = {}) {
  const document = path
    ? readExtensionSettings(path)
    : { version: 1, packages: [] };
  return catalog(document, options).flatMap(
    ({ id, source: _source, ...registration }) => {
      if (
        registration.enabled !== false &&
        readExtensionPackage(registration.path, { module: "agent" }).manifest
          .id !== id
      )
        throw new Error(`插件身份已改变：${id}`);
      const sources = resolveExtensionPackages([registration]);
      if (sources.length && sources[0].id !== id)
        throw new Error(`插件身份已改变：${id}`);
      return sources;
    },
  );
}

/** Metadata and settings only. Mutations never alter an in-flight run. */
export function createExtensionPackageManager(
  settingsPath,
  managerOptions = {},
) {
  absolute(settingsPath);
  const update = async (mutate) => {
    await mkdir(dirname(settingsPath), { recursive: true });
    return withFileLock(settingsPath, async () => {
      const document = readExtensionSettings(settingsPath);
      const value = mutate(document.packages, document);
      assertValid(validateSettings, document, "插件设置无效");
      await writeFileAtomic(
        settingsPath,
        JSON.stringify(document, null, 2) + "\n",
        { mode: 0o600, dirMode: 0o700 },
      );
      return structuredClone(value);
    });
  };
  return {
    list: () => catalog(readExtensionSettings(settingsPath), managerOptions),
    resolve: () => loadExtensionSettingsSources(settingsPath, managerOptions),
    async add(path, options = {}) {
      const registration = { ...options, path };
      assertValid(validateRegistration, registration, "插件注册信息无效");
      const pkg = readExtensionPackage(path);
      resolveExtensionConfig(pkg.manifest, options.config);
      const record = {
        ...registration,
        path: pkg.root,
        id: pkg.manifest.id,
        enabled: options.enabled ?? true,
      };
      return update((items, document) => {
        if (
          catalog(document, managerOptions).some(
            (item) => item.id === record.id,
          )
        )
          throw new Error(`重复插件：${record.id}`);
        items.push(record);
        return record;
      });
    },
    configure(id, patch) {
      assertValid(
        validateRegistration,
        { ...patch, path: "/placeholder" },
        "插件注册信息无效",
      );
      if (Object.hasOwn(patch, "path"))
        throw new Error("configure 不允许替换插件路径");
      return update((items, document) => {
        const bundled = bundledRecords(managerOptions.bundledPath).find(
          (item) => item.id === id,
        );
        if (bundled) {
          const overrides = { ...document.bundled?.[id], ...patch };
          const next = { ...bundled, ...overrides };
          if (next.enabled || Object.hasOwn(patch, "config")) {
            const pkg = readExtensionPackage(next.path);
            resolveExtensionConfig(pkg.manifest, next.config);
          }
          document.bundled ??= {};
          document.bundled[id] = overrides;
          return next;
        }
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) throw new Error(`插件未注册：${id}`);
        const next = { ...items[index], ...patch };
        // Disabling a missing/broken package must remain possible.
        if (next.enabled || Object.hasOwn(patch, "config")) {
          const pkg = readExtensionPackage(next.path);
          if (pkg.manifest.id !== id) throw new Error(`插件身份已改变：${id}`);
          resolveExtensionConfig(pkg.manifest, next.config);
        }
        items[index] = next;
        return next;
      });
    },
    async remove(id) {
      await update((items) => {
        if (
          bundledRecords(managerOptions.bundledPath).some(
            (item) => item.id === id,
          )
        )
          throw new Error(`内置插件不能移除，请停用：${id}`);
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) throw new Error(`插件未注册：${id}`);
        items.splice(index, 1);
        return null;
      });
    },
  };
}
