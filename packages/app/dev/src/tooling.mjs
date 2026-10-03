import {
  PRODUCT_CONFIG,
  APP_DISPLAY_NAME,
  PRODUCT_KEYS,
  PRODUCT_NAMESPACE,
  productDataName,
  productId,
} from "@mewvis/product-config";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
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
import { Ajv } from "ajv";
import accessSchema from "@mewvis/chat-contracts/agent-access.schema.json" with { type: "json" };
import { dshBundleCompatibilityPlugin } from "./dsh.mjs";

import {
  readProject,
  importSource,
  hostSource,
  uiSource,
  browserBoundary,
  loadHostEntry,
  loadTools,
  loadSkills,
} from "./project.mjs";
import { createReactApplication } from "./template.mjs";

const BUILD_MARKER = productDataName("-app-build.json");
const accessValidator = new Ajv({ allErrors: true }).compile({
  ...accessSchema,
  anyOf: undefined,
  $ref: "#/definitions/AgentAccess",
});
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const ENTRY_PATTERN = /^\.\/.*\.m?js$/;
const PERMISSIONS = new Set([
  "network",
  "application-data",
  "application-workspaces",
  "workspace-files",
  "open-external",
  "process",
  "chat",
  "chat-knowledge",
  "embedded-views",
]);
const sdkEntry = createRequire(import.meta.url).resolve("@mewvis/app-sdk");

const mewvisSdkResolver = {
  name: productId("-app-sdk"),
  setup(buildContext) {
    buildContext.onResolve(
      {
        filter:
          /^@mewvis\/app-sdk(?:\/(?:browser|data|views(?:\/runtime)?|chat(?:\/react)?))?$/,
      },
      ({ path }) => ({
        path:
          path === "@mewvis/app-sdk"
            ? sdkEntry
            : createRequire(import.meta.url).resolve(path),
      }),
    );
  },
};

// One React instance per sandbox, supplied together with the shared Chat runtime.
const applicationReactResolver = {
  name: productId("-shared-react"),
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
          throw new Error(`不支持的应用 React 入口：${path}`);
        return { path, namespace: productId("-react") };
      },
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: productId("-react") },
      async ({ path }) => {
        const source =
          path === "react/jsx-dev-runtime" ? "react/jsx-runtime" : path;
        const exports = Object.keys(await import(source)).filter(
          (name) => name !== "default" && name !== "module.exports",
        );
        return {
          contents:
            `const api = globalThis[${JSON.stringify(PRODUCT_KEYS.applicationReactGlobal)}].${modules[path]}; export default api;\n` +
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
    throw new Error(`${label} 不能越过应用目录。`);
  return path;
};

const assertRealContained = async (root, path, label) => {
  const canonical = await realpath(path);
  if (canonical === root || !canonical.startsWith(`${root}${sep}`))
    throw new Error(`${label} 不能越过应用目录。`);
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
      `无法读取应用 package.json：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isObject(manifest))
    throw new Error("应用 package.json 必须是 JSON 对象。");
  return manifest;
};

const pushAsset = (assets, value, label) => {
  if (value === undefined) return;
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串。`);
  assets.add(value);
};

export const validateApplication = async (source) => {
  const root = await realpath(resolve(source));
  const manifest = await readManifest(root);
  const project = await readProject(root);
  if (project) {
    if (manifest[PRODUCT_KEYS.applicationManifest] !== undefined)
      throw new Error(
        `使用 ${PRODUCT_CONFIG.files.appConfig} 的项目不应在 package.json 重复声明 ${PRODUCT_NAMESPACE}`,
      );
    const { config, uiEntry } = project;
    manifest[PRODUCT_KEYS.applicationManifest] = {
      app: { version: 1, entry: "./index.js" },
      displayName: config.displayName,
      defaultEnabled: config.defaultEnabled ?? false,
      permissions: config.permissions,
      ...(config.agentAccess === undefined
        ? {}
        : { agentAccess: config.agentAccess }),
      ...(uiEntry
        ? {
            ui: {
              version: 1,
              kind: "sandbox",
              entry: "./" + relative(root, uiEntry).split(sep).join("/"),
              title: config.ui?.title ?? config.displayName,
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

  const mewvis = isObject(manifest[PRODUCT_KEYS.applicationManifest])
    ? manifest[PRODUCT_KEYS.applicationManifest]
    : undefined;
  const application = mewvis && isObject(mewvis.app) ? mewvis.app : undefined;
  if (!application) {
    problems.push(`缺少 ${PRODUCT_NAMESPACE}.app 原生入口声明。`);
  } else {
    if (application.version !== 1)
      problems.push(productId(".app.version 必须为 1。"));
    if (
      typeof application.entry !== "string" ||
      !ENTRY_PATTERN.test(application.entry)
    ) {
      problems.push(
        productId(".app.entry 必须是以 ./ 开头的 .js 或 .mjs 文件。"),
      );
    } else {
      try {
        const entry = containedPath(
          root,
          application.entry,
          productId(".app.entry"),
        );
        if (!project && !(await fileExists(entry)))
          problems.push(`应用入口不存在：${application.entry}`);
        else if (!project)
          await assertRealContained(root, entry, productId(".app.entry"));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (!Array.isArray(mewvis?.permissions)) {
    problems.push(
      productId(
        ".permissions 必须是权限用途数组；没有额外能力时请声明空数组。",
      ),
    );
  } else {
    const unique = new Set(mewvis.permissions);
    if (unique.size !== mewvis.permissions.length)
      problems.push(productId(".permissions 不能包含重复项。"));
    for (const permission of unique) {
      if (typeof permission !== "string" || !PERMISSIONS.has(permission)) {
        problems.push(`不支持的应用权限：${String(permission)}。`);
      }
    }
  }

  if (mewvis?.agentAccess !== undefined && !accessValidator(mewvis.agentAccess))
    problems.push(
      `${PRODUCT_NAMESPACE}.agentAccess 不符合权限协议：${JSON.stringify(accessValidator.errors)}`,
    );

  const assets = new Set(["./README.md", "./LICENSE"]);
  const requiredAssets = new Set();
  if (application && Array.isArray(application.assets)) {
    for (const [index, asset] of application.assets.entries()) {
      pushAsset(assets, asset, `${PRODUCT_NAMESPACE}.app.assets[${index}]`);
      requiredAssets.add(asset);
    }
  } else if (application?.assets !== undefined) {
    problems.push(productId(".app.assets 必须是相对文件路径数组。"));
  }

  if (mewvis?.ui !== undefined) {
    if (!isObject(mewvis.ui)) {
      problems.push(productId(".ui 必须是对象。"));
    } else {
      if (mewvis.ui.version !== 1)
        problems.push(productId(".ui.version 必须为 1。"));
      if (mewvis.ui.kind !== "sandbox")
        problems.push(productId('.ui.kind 必须是 "sandbox"。'));
      try {
        if (typeof mewvis.ui.entry !== "string")
          throw new Error(productId(".ui.entry 必须是字符串。"));
        pushAsset(assets, mewvis.ui.entry, productId(".ui.entry"));
        requiredAssets.add(mewvis.ui.entry);
        pushAsset(assets, mewvis.ui.style, productId(".ui.style"));
        if (mewvis.ui.style !== undefined) requiredAssets.add(mewvis.ui.style);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  for (const asset of assets) {
    try {
      const path = containedPath(root, asset, "应用资源路径");
      if (!(await fileExists(path))) {
        assets.delete(asset);
        if (requiredAssets.has(asset))
          problems.push(`声明的应用资源不存在：${asset}`);
      } else {
        await assertRealContained(root, path, `应用资源 ${asset}`);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `应用校验失败：\n${problems.map((problem) => `- ${problem.trim()}`).join("\n")}`,
    );
  }
  if (project) {
    if (project.hostEntry) await loadHostEntry(project);
    else {
      await loadTools(project);
      await loadSkills(project);
    }
  }
  return Object.freeze({
    root,
    manifest,
    entry: containedPath(root, application.entry, productId(".app.entry")),
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
      "输出目录不能是文件系统根目录、应用源码目录或源码目录的上级。",
    );
  }
  if (
    (await fileExists(outputRoot)) &&
    !(await fileExists(join(outputRoot, BUILD_MARKER)))
  ) {
    throw new Error(
      `输出目录已经存在且不是 ${APP_DISPLAY_NAME} 构建产物：${outputRoot}`,
    );
  }
};

const outputManifest = (manifest, target) => {
  const mewvis = structuredClone(manifest[PRODUCT_KEYS.applicationManifest]);
  mewvis.app.entry = "./index.js";
  const output = {
    name: manifest.name,
    version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
    description:
      typeof manifest.description === "string" ? manifest.description : "",
    type: "module",
    main: "./index.js",
    exports: "./index.js",
    bundled: true,
    [PRODUCT_KEYS.applicationManifest]: mewvis,
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
  if (!id) throw new Error(`无法从包名生成 DSH 应用 ID：${name}`);
  await writeFile(
    join(root, "cordis.patch.yml"),
    `- insert:\n    - id: ${id}\n      name: ${JSON.stringify(name)}\n`,
    "utf8",
  );
};

export const packApplication = async ({
  source,
  target = PRODUCT_KEYS.applicationManifest,
  outDir,
  quiet = false,
}) => {
  if (target !== PRODUCT_KEYS.applicationManifest && target !== "dsh")
    throw new Error(`打包目标必须是 "${PRODUCT_NAMESPACE}" 或 "dsh"。`);
  const validated = await validateApplication(source);
  if (
    target === "dsh" &&
    validated.manifest[PRODUCT_KEYS.applicationManifest].permissions.includes(
      "chat",
    )
  )
    throw new Error(
      `应用聊天能力需要 ${APP_DISPLAY_NAME} 宿主，不能打包为 DSH 目标`,
    );
  const outputRoot = resolve(outDir ?? join(validated.root, "dist", target));
  await assertSafeOutput(validated.root, outputRoot);
  await mkdir(dirname(outputRoot), { recursive: true });
  const stagingRoot = await mkdtemp(
    join(dirname(outputRoot), productDataName("-app-pack-")),
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
        js: 'import { createRequire as __mewvisCreateRequire } from "node:module"; const require = __mewvisCreateRequire(import.meta.url);',
      },
      plugins: [mewvisSdkResolver, dshBundleCompatibilityPlugin],
    });

    for (const asset of validated.assets) {
      if (
        validated.project &&
        asset === validated.manifest[PRODUCT_KEYS.applicationManifest].ui?.entry
      )
        continue;
      const sourcePath = containedPath(validated.root, asset, "应用资源路径");
      const destination = join(
        stagingRoot,
        relative(validated.root, sourcePath),
      );
      await mkdir(dirname(destination), { recursive: true });
      await cp(sourcePath, destination, { recursive: true });
    }

    const manifest = outputManifest(validated.manifest, target);
    if (
      manifest[PRODUCT_KEYS.applicationManifest]?.ui &&
      (validated.project ||
        validated.manifest[
          PRODUCT_KEYS.applicationManifest
        ].permissions.includes("chat"))
    ) {
      const ui = validated.manifest[PRODUCT_KEYS.applicationManifest].ui;
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
                containedPath(validated.root, ui.entry, productId(".ui.entry")),
              ],
            }),
        outfile: join(stagingRoot, PRODUCT_CONFIG.files.appUiScript),
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
          ...(await applicationStyles(validated.root)),
          ...(validated.project
            ? [browserBoundary(validated.root, validated.project)]
            : []),
          mewvisSdkResolver,
          ...(validated.manifest[
            PRODUCT_KEYS.applicationManifest
          ].permissions.includes("chat")
            ? [applicationReactResolver]
            : []),
        ],
      });
      let style = ui.style
        ? await readFile(
            containedPath(validated.root, ui.style, productId(".ui.style")),
            "utf8",
          )
        : "";
      for (const file of bundle.outputFiles) {
        if (file.path.endsWith(".css")) style += "\n" + file.text;
        else
          await writeFile(
            join(stagingRoot, PRODUCT_CONFIG.files.appUiScript),
            file.contents,
          );
      }
      if (
        Buffer.byteLength(
          bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
        ) >
        8 * 1024 * 1024
      )
        throw new Error("应用 UI 超过 8 MiB 宿主限制");
      if (Buffer.byteLength(style) > 2 * 1024 * 1024)
        throw new Error("应用样式超过 2 MiB 宿主限制");
      manifest[PRODUCT_KEYS.applicationManifest].ui = {
        ...ui,
        entry: `./${PRODUCT_CONFIG.files.appUiScript}`,
        ...(style ? { style: `./${PRODUCT_CONFIG.files.appUiStyle}` } : {}),
      };
      if (style)
        await writeFile(
          join(stagingRoot, PRODUCT_CONFIG.files.appUiStyle),
          style,
        );
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
      `应用已打包：${validated.manifest.name} -> ${outputRoot} (${target})`,
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

export const createApplication = async ({
  destination,
  name,
  template = "react",
  local = false,
}) => {
  if (template === "react")
    return createReactApplication({ destination, name, local });
  if (template !== "tools") throw new Error("模板必须是 react 或 tools");
  const root = resolve(destination);
  if (await fileExists(root)) throw new Error(`目标目录已经存在：${root}`);
  const slug = slugFromPath(root.split(sep).at(-1) ?? "");
  const packageName = name ?? `@${PRODUCT_NAMESPACE}/${slug}`;
  if (!PACKAGE_NAME.test(packageName))
    throw new Error(`应用包名无效：${packageName}`);
  const toolName = packageId(packageName).replace(/-/g, "_");
  await mkdir(root, { recursive: true });

  const manifest = {
    name: packageName,
    version: "0.1.0",
    description: `${packageName} ${APP_DISPLAY_NAME} application`,
    type: "module",
    main: "./index.js",
    exports: "./index.js",
    dependencies: { "@mewvis/app-sdk": "^0.1.0" },
    [PRODUCT_KEYS.applicationManifest]: {
      app: { version: 1, entry: "./index.js" },
      displayName: slug || packageName,
      defaultEnabled: false,
      permissions: [],
    },
  };
  const entry = `import { defineApplication, defineSkill, defineTool } from "@mewvis/app-sdk";

const tool = defineTool({
  risk: "low",
  name: ${JSON.stringify(toolName)},
  description: ${JSON.stringify(`Example tool generated by ${APP_DISPLAY_NAME} application tooling.`)},
  parameters: { type: "object", properties: {}, additionalProperties: false },
  output: {
    schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
    render: (_args, value) => [{ type: "text", text: value.message }],
  },
  execute: () => ({ message: "Hello from ${packageName}" }),
});

const skill = defineSkill({
  name: ${JSON.stringify(toolName)},
  description: ${JSON.stringify(`Use the example ${APP_DISPLAY_NAME} application tool.`)},
  content: "Call the ${toolName} tool when the user asks to test this application.",
});

export default defineApplication({
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
    `# ${packageName}\n\nCreated with ${APP_DISPLAY_NAME} application tooling.\n\nValidate with \`pnpm app:validate -- ${destination}\`.\n`,
    "utf8",
  );
  await validateApplication(root);
  return Object.freeze({ root, name: packageName });
};

// A project's PostCSS pipeline is shared by production packaging and Vite preview.
async function applicationStyles(root) {
  const configPath = join(root, "postcss.config.mjs");
  try {
    await access(configPath);
  } catch {
    return [];
  }
  const { default: config } = await importSource(configPath);
  if (!config || !Array.isArray(config.plugins))
    throw new Error("postcss.config.mjs 必须提供 plugins 数组");
  const postcss = createRequire(join(root, "package.json"))("postcss");
  return [
    {
      name: "application-postcss",
      setup(context) {
        context.onLoad({ filter: /\.css$/ }, async ({ path }) => {
          if (path.includes(`${sep}node_modules${sep}`)) return;
          const result = await postcss(config.plugins).process(
            await readFile(path, "utf8"),
            { from: path },
          );
          return {
            contents: result.css,
            loader: "css",
            resolveDir: dirname(path),
          };
        });
      },
    },
  ];
}
