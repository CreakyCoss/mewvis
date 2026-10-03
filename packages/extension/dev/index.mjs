import {
  PRODUCT_CONFIG,
  APP_DISPLAY_NAME,
  PRODUCT_KEYS,
  PRODUCT_NAMESPACE,
  productId,
} from "@mewvis/product-config";
import { build } from "esbuild";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  cp,
  lstat,
  realpath,
  readFile,
} from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readExtensionPackage } from "@mewvis/extension-host/management";

import { adaptMewvisPackage } from "@mewvis/extension-adapters/package";
const exec = promisify(execFile);
const sdkEntry = fileURLToPath(import.meta.resolve("@mewvis/extension-sdk"));

export async function createExtensionPackage(directory, id) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id))
    throw new Error("无效的插件 ID");
  const root = resolve(directory);
  // A new directory is required: never overwrite an existing project.
  await mkdir(root, { recursive: false });
  await mkdir(join(root, "src"));
  const pkg = {
    name: id,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      build: `${PRODUCT_CONFIG.cli.extension} build`,
      validate: `${PRODUCT_CONFIG.cli.extension} validate dist/plugin`,
      pack: `${PRODUCT_CONFIG.cli.extension} pack`,
    },
    dependencies: { "@mewvis/extension-sdk": "workspace:*" },
    devDependencies: { "@mewvis/extension-dev": "workspace:*" },
    [PRODUCT_KEYS.extensionManifest]: {
      schemaVersion: 2,
      id,
      apiVersion: 1,
      modules: { agent: { entry: "./index.js", capabilities: ["commands"] } },
    },
  };
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  await writeFile(
    join(root, "src/index.ts"),
    `import { defineExtension } from "@mewvis/extension-sdk/agent";

export default defineExtension({
  id: ${JSON.stringify(id)},
  apiVersion: 1,
  setup(ctx) {
    ctx.registerCommand({
      name: "hello",
      description: "问候命令",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() { return { message: ${JSON.stringify(`你好，${APP_DISPLAY_NAME}！`)} }; },
    });
  },
});
`,
  );
  return root;
}

/** Build a self-contained package; no plugin or package lifecycle script is executed. */
export async function buildExtensionPackage(directory, { outputDir } = {}) {
  const metadata = JSON.parse(
    await readFile(join(resolve(directory), "package.json"), "utf8"),
  );
  if (
    metadata[PRODUCT_KEYS.pluginManifest] &&
    metadata[PRODUCT_KEYS.extensionManifest]
  )
    throw new Error("不能同时声明原生与 SDK 插件清单");
  const external = Boolean(metadata[PRODUCT_KEYS.extensionManifest]);
  const pkg = readExtensionPackage(resolve(directory), {
    checkEntry: false,
    ...(external && { decode: adaptMewvisPackage }),
  });
  const output = resolve(outputDir ?? join(pkg.root, "dist/plugin"));
  if (output === pkg.root || !relative(output, pkg.root).startsWith(".."))
    throw new Error("构建输出不能覆盖项目或其父目录");
  // Custom output must be absent. Replace dist/plugin only after building succeeds.
  const staging = await mkdtemp(join(tmpdir(), productId("-extension-build-")));
  try {
    for (const [kind, declaration] of Object.entries(pkg.manifest.modules)) {
      if (!declaration.entry) continue;
      const browser = kind === "ui";
      await build({
        ...(external
          ? {
              stdin: {
                contents: `import definition from ${JSON.stringify(join(pkg.root, browser ? "src/ui.ts" : "src/index.ts"))}; import { ${browser ? "adaptUIExtension" : "adaptAgentExtension"} as adapt } from ${JSON.stringify(fileURLToPath(import.meta.resolve("@mewvis/extension-adapters")))}; export default adapt(definition);`,
                resolveDir: pkg.root,
                sourcefile: productId("-adapter-entry.js"),
              },
            }
          : {
              entryPoints: [
                join(pkg.root, browser ? "src/ui.ts" : "src/index.ts"),
              ],
            }),
        outfile: resolve(staging, declaration.entry),
        bundle: true,
        platform: browser ? "browser" : "node",
        format: "esm",
        target: browser ? "es2022" : "node22",
        ...(browser && {
          jsx: "automatic",
          minify: true,
          define: { "process.env.NODE_ENV": '"production"' },
        }),
        alias: {
          "@mewvis/extension-sdk/agent": fileURLToPath(
            import.meta.resolve("@mewvis/extension-sdk/agent"),
          ),
          "@mewvis/extension-sdk/ui": fileURLToPath(
            import.meta.resolve("@mewvis/extension-sdk/ui"),
          ),
          "@mewvis/extension-sdk/host": fileURLToPath(
            import.meta.resolve("@mewvis/extension-sdk/host"),
          ),
          "@mewvis/extension-sdk": sdkEntry,
          ...(!external &&
            Object.fromEntries(
              ["", "/agent", "/ui", "/services"].map((suffix) => [
                `@${PRODUCT_NAMESPACE}/extension-host${suffix}`,
                fileURLToPath(
                  import.meta.resolve(
                    `@${PRODUCT_NAMESPACE}/extension-host${suffix}`,
                  ),
                ),
              ]),
            )),
        },
        ...(!browser && {
          banner: {
            js: "import { createRequire as __mewvisRequire } from 'node:module'; const require = __mewvisRequire(import.meta.url);",
          },
        }),
        plugins: [
          {
            name: productId("-plugin-boundary"),
            setup(builder) {
              builder.onResolve(
                {
                  filter:
                    /^@(?:earendil-works\/pi-|mewvis\/(?:agent-runtime|app-host|extension-host))/,
                },
                (args) =>
                  !external && args.path.startsWith("@mewvis/extension-host")
                    ? undefined
                    : {
                        errors: [
                          {
                            text: `插件不能依赖宿主或 Agent 内部包：${args.path}`,
                          },
                        ],
                      },
              );
            },
          },
        ],
      });
    }
    const artifact = {
      name: pkg.packageJson.name,
      version: pkg.packageJson.version,
      type: "module",
      [PRODUCT_KEYS.pluginManifest]: pkg.manifest,
    };
    for (const key of ["description", "license", "keywords"]) {
      if (pkg.packageJson[key] !== undefined)
        artifact[key] = pkg.packageJson[key];
    }
    await writeFile(
      join(staging, "package.json"),
      JSON.stringify(artifact, null, 2) + "\n",
    );
    for (const name of ["README.md", "LICENSE"]) {
      try {
        const path = join(pkg.root, name);
        if ((await lstat(path)).isFile()) await cp(path, join(staging, name));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    readExtensionPackage(staging);
    const conventional = output === join(pkg.root, "dist/plugin");
    // Refuse custom output replacement, and never follow a substituted dist symlink.
    const parent = dirname(output);
    await mkdir(parent, { recursive: true });
    if (conventional && (await realpath(parent)) !== parent)
      throw new Error("构建输出父目录不能为符号链接");
    try {
      const current = await lstat(output);
      if (!conventional || current.isSymbolicLink())
        throw new Error("输出目录已存在或为符号链接");
      await rm(output, { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await cp(staging, output, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    return readExtensionPackage(output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function packExtensionPackage(directory, { outputDir } = {}) {
  const root = resolve(directory);
  const temp = await mkdtemp(join(tmpdir(), productId("-extension-pack-")));
  try {
    const pkg = await buildExtensionPackage(root, {
      outputDir: join(temp, "package"),
    });
    const destination = resolve(outputDir ?? join(root, "dist"));
    await mkdir(destination, { recursive: true });
    const filename = `${pkg.manifest.id}-${pkg.packageJson.version}.tgz`;
    const archive = join(destination, filename);
    // Only the freshly built artifact is archived; no source tree, node_modules or install scripts.
    await exec("tar", ["-czf", archive, "-C", temp, "package"]);
    return archive;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
