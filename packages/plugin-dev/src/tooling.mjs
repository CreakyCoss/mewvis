import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "./dsh.mjs";

import {
  readProject,
  hostSource,
  uiSource,
  browserBoundary,
} from "./project.mjs";
import { createReactPlugin } from "./template.mjs";

const BUILD_MARKER = ".isle-plugin-build.json";
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const ENTRY_PATTERN = /^\.\/.*\.m?js$/;
const PERMISSIONS = new Set([
  "network",
  "plugin-data",
  "workspace-files",
  "open-external",
  "process",
  "chat",
  "chat-knowledge",
]);
const sdkEntry = createRequire(import.meta.url).resolve("@isle/plugin-sdk");

const isleSdkResolver = {
  name: "isle-plugin-sdk",
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^@isle\/plugin-sdk(?:\/(?:browser|chat(?:\/react)?))?$/ },
      ({ path }) => ({
        path:
          path === "@isle/plugin-sdk"
            ? sdkEntry
            : createRequire(import.meta.url).resolve(path),
      }),
    );
  },
};

// One React instance per sandbox, supplied together with the shared Chat runtime.
const pluginReactResolver = {
  name: "isle-shared-react",
  setup(buildContext) {
    const modules = {
      react: "React",
      "react-dom": "ReactDOM",
      "react-dom/client": "ReactDOMClient",
      "react/jsx-runtime": "JSXRuntime",
      "react/jsx-dev-runtime": "JSXRuntime",
    };
    buildContext.onResolve(
      { filter: /^(react|react-dom)(\/.*)?$/ },
      ({ path }) => {
        if (!(path in modules))
          throw new Error(`不支持的插件 React 入口：${path}`);
        return { path, namespace: "isle-react" };
      },
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: "isle-react" },
      async ({ path }) => {
        const source =
          path === "react/jsx-dev-runtime" ? "react/jsx-runtime" : path;
        const exports = Object.keys(await import(source)).filter(
          (name) => name !== "default" && name !== "module.exports",
        );
        return {
          contents:
            `const api = globalThis.islePluginReact.${modules[path]}; export default api;\n` +
            exports
              .map((name) => `export const ${name} = api.${name};`)
              .join("\n"),
          loader: "js",
        };
      },
    );
  },
};

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fileExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const containedPath = (root, specifier, label) => {
  if (
    typeof specifier !== "string" ||
    !specifier.startsWith("./") ||
    isAbsolute(specifier)
  ) {
    throw new Error(`${label} 必须是以 ./ 开头的包内相对路径。`);
  }
  const path = resolve(root, specifier);
  if (path === root || !path.startsWith(`${root}${sep}`))
    throw new Error(`${label} 不能越过插件目录。`);
  return path;
};

const assertRealContained = async (root, path, label) => {
  const canonical = await realpath(path);
  if (canonical === root || !canonical.startsWith(`${root}${sep}`))
    throw new Error(`${label} 不能越过插件目录。`);
};

const packageId = (name) =>
  name
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const readManifest = async (root) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(
      `无法读取插件 package.json：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isObject(manifest))
    throw new Error("插件 package.json 必须是 JSON 对象。");
  return manifest;
};

export const discoverPluginSources = async (source) => {
  const root = await realpath(resolve(source));
  const entries = await readdir(root, { withFileTypes: true });
  const plugins = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink())
      throw new Error(`内置插件目录不允许使用符号链接：${entry.name}`);
    if (!entry.isDirectory()) continue;
    const sourceRoot = join(root, entry.name);
    await readManifest(sourceRoot);
    plugins.push(Object.freeze({ name: entry.name, sourceRoot }));
  }
  return Object.freeze(plugins);
};

const pushAsset = (assets, value, label) => {
  if (value === undefined) return;
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串。`);
  assets.add(value);
};

export const validatePlugin = async (source) => {
  const root = await realpath(resolve(source));
  const manifest = await readManifest(root);
  const project = await readProject(root);
  if (project) {
    if (manifest.isle !== undefined)
      throw new Error(
        "使用 isle.config.ts 的项目不应在 package.json 重复声明 isle",
      );
    const { config, uiEntry } = project;
    manifest.isle = {
      plugin: { version: 1, entry: "./index.js" },
      displayName: config.displayName,
      defaultEnabled: config.defaultEnabled ?? false,
      permissions: config.permissions,
      ...(uiEntry
        ? {
            ui: {
              version: 1,
              kind: "sandbox",
              entry: "./" + relative(root, uiEntry).split(sep).join("/"),
              title: config.ui?.title ?? config.displayName,
              layout: config.ui?.layout ?? "full",
            },
          }
        : {}),
    };
  }
  const problems = [];
  const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
  if (!PACKAGE_NAME.test(name) || name.length > 214 || name !== manifest.name) {
    problems.push("name 必须是安全且不含首尾空格的 npm 包名。");
  }
  if (manifest.type !== "module") problems.push('type 必须是 "module"。');

  const isle = isObject(manifest.isle) ? manifest.isle : undefined;
  const plugin = isle && isObject(isle.plugin) ? isle.plugin : undefined;
  if (!plugin) {
    problems.push("缺少 isle.plugin 原生入口声明。");
  } else {
    if (plugin.version !== 1) problems.push("isle.plugin.version 必须为 1。");
    if (typeof plugin.entry !== "string" || !ENTRY_PATTERN.test(plugin.entry)) {
      problems.push("isle.plugin.entry 必须是以 ./ 开头的 .js 或 .mjs 文件。");
    } else {
      try {
        const entry = containedPath(root, plugin.entry, "isle.plugin.entry");
        if (!project && !(await fileExists(entry)))
          problems.push(`插件入口不存在：${plugin.entry}`);
        else if (!project)
          await assertRealContained(root, entry, "isle.plugin.entry");
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (!Array.isArray(isle?.permissions)) {
    problems.push(
      "isle.permissions 必须是权限用途数组；没有额外能力时请声明空数组。",
    );
  } else {
    const unique = new Set(isle.permissions);
    if (unique.size !== isle.permissions.length)
      problems.push("isle.permissions 不能包含重复项。");
    for (const permission of unique) {
      if (typeof permission !== "string" || !PERMISSIONS.has(permission)) {
        problems.push(`不支持的插件权限：${String(permission)}。`);
      }
    }
  }

  const assets = new Set(["./README.md", "./LICENSE"]);
  const requiredAssets = new Set();
  if (plugin && Array.isArray(plugin.assets)) {
    for (const [index, asset] of plugin.assets.entries()) {
      pushAsset(assets, asset, `isle.plugin.assets[${index}]`);
      requiredAssets.add(asset);
    }
  } else if (plugin?.assets !== undefined) {
    problems.push("isle.plugin.assets 必须是相对文件路径数组。");
  }

  if (isle?.ui !== undefined) {
    if (!isObject(isle.ui)) {
      problems.push("isle.ui 必须是对象。");
    } else {
      if (isle.ui.version !== 1) problems.push("isle.ui.version 必须为 1。");
      if (isle.ui.kind !== "sandbox")
        problems.push('isle.ui.kind 必须是 "sandbox"。');
      try {
        if (typeof isle.ui.entry !== "string")
          throw new Error("isle.ui.entry 必须是字符串。");
        pushAsset(assets, isle.ui.entry, "isle.ui.entry");
        requiredAssets.add(isle.ui.entry);
        pushAsset(assets, isle.ui.style, "isle.ui.style");
        if (isle.ui.style !== undefined) requiredAssets.add(isle.ui.style);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  for (const asset of assets) {
    try {
      const path = containedPath(root, asset, "插件资源路径");
      if (!(await fileExists(path))) {
        assets.delete(asset);
        if (requiredAssets.has(asset))
          problems.push(`声明的插件资源不存在：${asset}`);
      } else {
        await assertRealContained(root, path, `插件资源 ${asset}`);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `插件校验失败：\n${problems.map((problem) => `- ${problem.trim()}`).join("\n")}`,
    );
  }
  return Object.freeze({
    root,
    manifest,
    entry: containedPath(root, plugin.entry, "isle.plugin.entry"),
    assets,
    project,
  });
};

const assertSafeOutput = async (sourceRoot, outputRoot) => {
  const filesystemRoot = parse(outputRoot).root;
  if (
    outputRoot === filesystemRoot ||
    outputRoot === sourceRoot ||
    sourceRoot.startsWith(`${outputRoot}${sep}`)
  ) {
    throw new Error(
      "输出目录不能是文件系统根目录、插件源码目录或源码目录的上级。",
    );
  }
  if (
    (await fileExists(outputRoot)) &&
    !(await fileExists(join(outputRoot, BUILD_MARKER)))
  ) {
    throw new Error(`输出目录已经存在且不是 Isle 构建产物：${outputRoot}`);
  }
};

const outputManifest = (manifest, target) => {
  const isle = structuredClone(manifest.isle);
  isle.plugin.entry = "./index.js";
  const output = {
    name: manifest.name,
    version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
    description:
      typeof manifest.description === "string" ? manifest.description : "",
    type: "module",
    main: "./index.js",
    exports: "./index.js",
    bundled: true,
    isle,
  };
  for (const field of [
    "license",
    "author",
    "repository",
    "homepage",
    "bugs",
    "keywords",
    "engines",
  ]) {
    if (manifest[field] !== undefined) output[field] = manifest[field];
  }
  if (target === "dsh")
    output.dsh = { bundle: { patch: "./cordis.patch.yml" } };
  return output;
};

const writeDshPatch = async (root, name) => {
  const id = packageId(name);
  if (!id) throw new Error(`无法从包名生成 DSH 插件 ID：${name}`);
  await writeFile(
    join(root, "cordis.patch.yml"),
    `- insert:\n    - id: ${id}\n      name: ${JSON.stringify(name)}\n`,
    "utf8",
  );
};

export const packPlugin = async ({
  source,
  target = "isle",
  outDir,
  quiet = false,
}) => {
  if (target !== "isle" && target !== "dsh")
    throw new Error('打包目标必须是 "isle" 或 "dsh"。');
  const validated = await validatePlugin(source);
  if (target === "dsh" && validated.manifest.isle.permissions.includes("chat"))
    throw new Error("插件聊天能力需要 Isle 宿主，不能打包为 DSH 目标");
  const outputRoot = resolve(outDir ?? join(validated.root, "dist", target));
  await assertSafeOutput(validated.root, outputRoot);
  await mkdir(dirname(outputRoot), { recursive: true });
  const stagingRoot = await mkdtemp(
    join(dirname(outputRoot), ".isle-plugin-pack-"),
  );

  try {
    await build({
      ...(validated.project
        ? {
            stdin: {
              contents: hostSource(validated.project, validated.manifest.name),
              resolveDir: validated.root,
              loader: "js",
            },
          }
        : { entryPoints: [validated.entry] }),
      outfile: join(stagingRoot, "index.js"),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      minify: false,
      sourcemap: false,
      banner: {
        js: 'import { createRequire as __isleCreateRequire } from "node:module"; const require = __isleCreateRequire(import.meta.url);',
      },
      plugins: [isleSdkResolver, dshBundleCompatibilityPlugin],
    });

    for (const asset of validated.assets) {
      if (validated.project && asset === validated.manifest.isle.ui?.entry)
        continue;
      const sourcePath = containedPath(validated.root, asset, "插件资源路径");
      const destination = join(
        stagingRoot,
        relative(validated.root, sourcePath),
      );
      await mkdir(dirname(destination), { recursive: true });
      await cp(sourcePath, destination, { recursive: true });
    }

    const manifest = outputManifest(validated.manifest, target);
    if (
      manifest.isle?.ui &&
      (validated.project ||
        validated.manifest.isle.permissions.includes("chat"))
    ) {
      const ui = validated.manifest.isle.ui;
      const bundle = await build({
        ...(validated.project
          ? {
              stdin: {
                contents: uiSource(validated.project),
                resolveDir: validated.root,
                loader: "js",
              },
            }
          : {
              entryPoints: [
                containedPath(validated.root, ui.entry, "isle.ui.entry"),
              ],
            }),
        outfile: join(stagingRoot, "isle-ui.js"),
        bundle: true,
        platform: "browser",
        format: "iife",
        target: "es2022",
        minify: true,
        logLevel: quiet ? "silent" : "warning",
        write: false,
        jsx: "automatic",
        nodePaths: [
          resolve(dirname(sdkEntry), "node_modules"),
          ...createRequire(import.meta.url).resolve.paths("react"),
        ],
        loader: {
          ".png": "dataurl",
          ".jpg": "dataurl",
          ".jpeg": "dataurl",
          ".svg": "dataurl",
          ".webp": "dataurl",
          ".woff": "dataurl",
          ".woff2": "dataurl",
        },
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [
          ...(validated.project
            ? [browserBoundary(validated.root, validated.project)]
            : []),
          isleSdkResolver,
          ...(validated.manifest.isle.permissions.includes("chat")
            ? [pluginReactResolver]
            : []),
        ],
      });
      let style = ui.style
        ? await readFile(
            containedPath(validated.root, ui.style, "isle.ui.style"),
            "utf8",
          )
        : "";
      for (const file of bundle.outputFiles) {
        if (file.path.endsWith(".css")) style += "\n" + file.text;
        else await writeFile(join(stagingRoot, "isle-ui.js"), file.contents);
      }
      if (
        Buffer.byteLength(
          bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
        ) >
        512 * 1024
      )
        throw new Error("插件 UI 超过 512 KiB 宿主限制");
      if (Buffer.byteLength(style) > 256 * 1024)
        throw new Error("插件样式超过 256 KiB 宿主限制");
      manifest.isle.ui = {
        ...ui,
        entry: "./isle-ui.js",
        ...(style ? { style: "./isle-ui.css" } : {}),
      };
      if (style) await writeFile(join(stagingRoot, "isle-ui.css"), style);
    }
    await writeFile(
      join(stagingRoot, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    if (target === "dsh")
      await writeDshPatch(stagingRoot, validated.manifest.name);
    await writeFile(
      join(stagingRoot, BUILD_MARKER),
      `${JSON.stringify({ version: 1, target, source: validated.manifest.name }, null, 2)}\n`,
      "utf8",
    );

    await rm(outputRoot, { recursive: true, force: true });
    await rename(stagingRoot, outputRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  if (!quiet)
    console.log(
      `插件已打包：${validated.manifest.name} -> ${outputRoot} (${target})`,
    );
  return Object.freeze({
    outputRoot,
    target,
    manifest: JSON.parse(
      await readFile(join(outputRoot, "package.json"), "utf8"),
    ),
  });
};

const slugFromPath = (path) =>
  path
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const createPlugin = async ({
  destination,
  name,
  template = "react",
  local = false,
}) => {
  if (template === "react")
    return createReactPlugin({ destination, name, local });
  if (template !== "tools") throw new Error("模板必须是 react 或 tools");
  const root = resolve(destination);
  if (await fileExists(root)) throw new Error(`目标目录已经存在：${root}`);
  const slug = slugFromPath(root.split(sep).at(-1) ?? "");
  const packageName = name ?? `@isle/${slug}`;
  if (!PACKAGE_NAME.test(packageName))
    throw new Error(`插件包名无效：${packageName}`);
  const toolName = packageId(packageName).replace(/-/g, "_");
  await mkdir(root, { recursive: true });

  const manifest = {
    name: packageName,
    version: "0.1.0",
    description: `${packageName} Isle plugin`,
    type: "module",
    main: "./index.js",
    exports: "./index.js",
    dependencies: { "@isle/plugin-sdk": "^0.1.0" },
    isle: {
      plugin: { version: 1, entry: "./index.js" },
      displayName: slug || packageName,
      defaultEnabled: false,
      permissions: [],
    },
  };
  const entry = `import { definePlugin, defineSkill, defineTool } from "@isle/plugin-sdk";

const tool = defineTool({
  name: ${JSON.stringify(toolName)},
  description: "Example tool generated by Isle plugin tooling.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  output: {
    schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
    render: (_args, value) => [{ type: "text", text: value.message }],
  },
  execute: () => ({ message: "Hello from ${packageName}" }),
});

const skill = defineSkill({
  name: ${JSON.stringify(toolName)},
  description: "Use the example Isle plugin tool.",
  content: "Call the ${toolName} tool when the user asks to test this plugin.",
});

export default definePlugin({
  name: ${JSON.stringify(packageName)},
  inject: ["tools", "skills"],
  apply(ctx) {
    ctx.tools.register(tool);
    ctx.skills.register(skill);
  },
});
`;
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(root, "index.js"), entry, "utf8");
  await writeFile(
    join(root, "README.md"),
    `# ${packageName}\n\nCreated with Isle plugin tooling.\n\nValidate with \`pnpm plugin:validate -- ${destination}\`.\n`,
    "utf8",
  );
  await validatePlugin(root);
  return Object.freeze({ root, name: packageName });
};
