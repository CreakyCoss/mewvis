import { access, mkdtemp, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { isRiskLevel } from "@isle/chat-contracts";

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Bundle TS configuration/host modules beside their source so package resolution works
// outside the Isle repository too. Each load is fresh and cleans its own files.
export async function importSource(entry) {
  const temporary = await mkdtemp(join(dirname(entry), ".isle-load-"));
  try {
    const outfile = join(temporary, "module.mjs");
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      target: "node22",
      logLevel: "silent",
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function projectFile(root, value, label) {
  if (typeof value !== "string" || !value.startsWith("./"))
    throw new Error(`${label} 必须是 ./ 开头的项目内路径`);
  const file = await realpath(resolve(root, value));
  if (!file.startsWith(root + sep))
    throw new Error(`${label} 不能越过应用目录`);
  return file;
}

export async function readProject(root) {
  const file = join(root, "isle.config.ts");
  if (!(await exists(file))) return null;
  const { default: config } = await importSource(file);
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("isle.config.ts 必须默认导出应用配置");
  const allowed = [
    "displayName",
    "permissions",
    "agentAccess",
    "defaultEnabled",
    "ui",
    "host",
  ];
  for (const key of Object.keys(config))
    if (!allowed.includes(key)) throw new Error(`未知应用配置：${key}`);
  if (typeof config.displayName !== "string" || !config.displayName.trim())
    throw new Error("displayName 不能为空");
  if (
    config.defaultEnabled !== undefined &&
    typeof config.defaultEnabled !== "boolean"
  )
    throw new Error("defaultEnabled 必须是布尔值");
  if (
    config.host !== undefined &&
    (!config.host ||
      typeof config.host !== "object" ||
      Array.isArray(config.host) ||
      Object.keys(config.host).some(
        (key) => !["entry", "tools", "skills"].includes(key),
      ) ||
      (!Object.hasOwn(config.host, "entry") &&
        !Object.hasOwn(config.host, "tools") &&
        !Object.hasOwn(config.host, "skills")) ||
      (Object.hasOwn(config.host, "entry") &&
        (Object.hasOwn(config.host, "tools") || Object.hasOwn(config.host, "skills"))))
  )
    throw new Error("host 必须声明 entry，或声明 tools/skills 模块");
  const ui = config.ui === false ? undefined : (config.ui ?? {});
  if (
    ui &&
    (typeof ui !== "object" ||
      Array.isArray(ui) ||
      Object.keys(ui).some(
        (key) => !["entry", "title", "layout"].includes(key),
      ))
  )
    throw new Error("ui 配置无效");
  if (ui?.layout && !["full", "contained", "fullscreen"].includes(ui.layout))
    throw new Error("ui.layout 必须是 full、contained 或 fullscreen");
  if (
    ui?.title !== undefined &&
    (typeof ui.title !== "string" || !ui.title.trim() || ui.title.length > 100)
  )
    throw new Error("ui.title 必须为 1–100 个字符");
  const uiEntry = ui
    ? await projectFile(root, ui.entry ?? "./main/App.tsx", "ui.entry")
    : undefined;
  const hostEntry =
    config.host && Object.hasOwn(config.host, "entry")
      ? await projectFile(root, config.host.entry, "host.entry")
      : undefined;
  const toolsEntry =
    config.host && Object.hasOwn(config.host, "tools")
      ? await projectFile(root, config.host.tools, "host.tools")
      : undefined;
  const skillsEntry =
    config.host && Object.hasOwn(config.host, "skills")
      ? await projectFile(root, config.host.skills, "host.skills")
      : undefined;
  return { config, uiEntry, hostEntry, toolsEntry, skillsEntry };
}

export function hostSource(project, name) {
  if (project.hostEntry) return `export { default } from ${JSON.stringify(project.hostEntry)};`;
  return `${project.toolsEntry ? `import tools from ${JSON.stringify(project.toolsEntry)};` : "const tools = [];"}
${project.skillsEntry ? `import skills from ${JSON.stringify(project.skillsEntry)};` : "const skills = [];"}
import { defineApplication } from "@isle/app-sdk";
export default defineApplication({ name: ${JSON.stringify(name)}, inject: ${JSON.stringify(
    [
      ...(project.toolsEntry ? ["tools"] : []),
      ...(project.skillsEntry ? ["skills"] : []),
    ],
  )}, apply(ctx) {
  for (const tool of tools) ctx.tools.register(tool);
  for (const skill of skills) ctx.skills.register({ ...skill, source: skill.source ?? "bundled" });
}});`;
}

export function uiSource(project) {
  return `import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(project.uiEntry)};
const root = document.createElement("div");
root.id = "isle-app-root";
root.style.height = "100%";
document.body.append(root);
createRoot(root).render(React.createElement(React.StrictMode, null, React.createElement(App)));`;
}

export async function loadTools(project) {
  if (!project.toolsEntry) return [];
  const { default: tools } = await importSource(project.toolsEntry);
  return validateTools(tools);
}

function validateTools(tools) {
  if (!Array.isArray(tools))
    throw new Error("host.tools 模块必须默认导出工具数组");
  const names = new Set();
  for (const tool of tools) {
    if (
      !tool ||
      typeof tool.name !== "string" ||
      !tool.name ||
      typeof tool.execute !== "function" ||
      !tool.parameters
    )
      throw new Error("宿主工具定义无效");
    if (!tool.output?.schema || typeof tool.output.render !== "function")
      throw new Error(
        `宿主工具 ${tool.name} 必须声明 output.schema 和 output.render`,
      );
    if (!isRiskLevel(tool.risk))
      throw new Error(
        `宿主工具 ${tool.name} 必须声明 risk：low、medium 或 high`,
      );
    if (names.has(tool.name)) throw new Error(`宿主工具名称重复：${tool.name}`);
    names.add(tool.name);
  }
  return tools;
}

export async function loadSkills(project) {
  if (!project.skillsEntry) return [];
  const { default: skills } = await importSource(project.skillsEntry);
  return validateSkills(skills);
}

function validateSkills(skills) {
  if (!Array.isArray(skills))
    throw new Error("host.skills 模块必须默认导出技能数组");
  const names = new Set();
  for (const skill of skills) {
    if (
      !skill ||
      ["name", "description", "content"].some(
        (key) => typeof skill[key] !== "string" || !skill[key].trim(),
      )
    )
      throw new Error("宿主技能必须声明非空 name、description 和 content");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name))
      throw new Error(
        `宿主技能名称必须使用小写字母、数字和单个连字符：${skill.name}`,
      );
    if (skill.source !== undefined && typeof skill.source !== "string")
      throw new Error(`宿主技能 ${skill.name} 的 source 必须是字符串`);
    if (
      skill.invocation !== undefined &&
      (!skill.invocation ||
        typeof skill.invocation.modelInvocable !== "boolean" ||
        typeof skill.invocation.userInvocable !== "boolean")
    )
      throw new Error(
        `宿主技能 ${skill.name} 的 invocation 必须声明 modelInvocable 和 userInvocable 布尔值`,
      );
    if (names.has(skill.name))
      throw new Error(`宿主技能名称重复：${skill.name}`);
    names.add(skill.name);
  }
  return skills;
}

export async function loadHostEntry(project) {
  if (!project.hostEntry) return null;
  const { default: application } = await importSource(project.hostEntry);
  if (!application || typeof application.apply !== "function")
    throw new Error("host.entry 必须默认导出 SDK 应用");
  const tools = [];
  const skills = [];
  await application.apply({
    tools: { register: (tool) => tools.push(tool) },
    skills: { register: (skill) => skills.push(skill) },
    // The in-memory preview has no real registered directories.
    workspaces: { get: async () => { throw new Error("请在 Isle 桌面宿主中选择真实工作区"); } },
  });
  return { tools: validateTools(tools), skills: validateSkills(skills) };
}

export function isHostFile(root, project, path) {
  const normalize = (value) => value.replaceAll("\\", "/");
  const file = normalize(path);
  const directories = [join(root, "main", "host")];
  const entries = [project.hostEntry, project.toolsEntry, project.skillsEntry].filter(Boolean);
  for (const entry of entries)
    if (dirname(entry) !== root) directories.push(dirname(entry));
  return (
    entries.some((entry) => file === normalize(entry)) ||
    directories.some((directory) => file.startsWith(normalize(directory) + "/"))
  );
}

// Runtime imports cannot cross from browser business code into main/host.
export function browserBoundary(root, project) {
  return {
    name: "isle-browser-boundary",
    setup(context) {
      context.onResolve(
        { filter: /^@isle\/app-sdk\/chat(?:\/react)?$/ },
        () => {
          if (!project.config.permissions.includes("chat"))
            throw new Error(
              "使用 Chat SDK 必须在 isle.config.ts 声明 chat 权限",
            );
        },
      );
      context.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path }) => {
        if (isHostFile(root, project, path))
          throw new Error(
            "React 页面不能导入 host 实现，请通过 @isle/app-sdk/browser 调用宿主工具；共享类型请放 main/contracts.ts",
          );
      });
    },
  };
}
