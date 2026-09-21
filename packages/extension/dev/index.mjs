import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, rm, cp, lstat, realpath } from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readExtensionPackage } from "@isle/extension-host";

const exec = promisify(execFile);
const sdkEntry = fileURLToPath(import.meta.resolve("@isle/extension-sdk"));

export async function createExtensionPackage(directory, id) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id)) throw new Error("无效的插件 ID");
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
      build: "isle-extension build",
      validate: "isle-extension validate dist/plugin",
      pack: "isle-extension pack",
    },
    dependencies: { "@isle/extension-sdk": "workspace:*" },
    devDependencies: { "@isle/extension-dev": "workspace:*" },
    "isle.extension": { schemaVersion: 1, id, apiVersion: 1, entry: "./index.js", capabilities: ["commands"] },
  };
  await writeFile(join(root, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await writeFile(
    join(root, "src/index.ts"),
    `import { defineExtension } from "@isle/extension-sdk";

export default defineExtension({
  id: ${JSON.stringify(id)},
  apiVersion: 1,
  setup(ctx) {
    ctx.registerCommand({
      name: "hello",
      description: "问候命令",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() { return { message: "你好，Isle！" }; },
    });
  },
});
`,
  );
  return root;
}

/** Build a self-contained package; no plugin or package lifecycle script is executed. */
export async function buildExtensionPackage(directory, { outputDir } = {}) {
  const pkg = readExtensionPackage(resolve(directory), { checkEntry: false });
  const output = resolve(outputDir ?? join(pkg.root, "dist/plugin"));
  if (output === pkg.root || !relative(output, pkg.root).startsWith(".."))
    throw new Error("构建输出不能覆盖项目或其父目录");
  // Custom output must be absent. Replace dist/plugin only after building succeeds.
  const staging = await mkdtemp(join(tmpdir(), "isle-extension-build-"));
  try {
    const outfile = resolve(staging, pkg.manifest.entry);
    await build({
      entryPoints: [join(pkg.root, "src/index.ts")],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      alias: { "@isle/extension-sdk": sdkEntry },
      banner: {
        js: "import { createRequire as __isleRequire } from 'node:module'; const require = __isleRequire(import.meta.url);",
      },
      plugins: [
        {
          name: "isle-plugin-boundary",
          setup(builder) {
            builder.onResolve(
              { filter: /^@(?:earendil-works\/pi-|isle\/(?:agent-runtime|app-host|extension-host))/ },
              (args) => ({ errors: [{ text: `插件不能依赖宿主或 Agent 内部包：${args.path}` }] }),
            );
          },
        },
      ],
    });
    const artifact = {
      name: pkg.packageJson.name,
      version: pkg.packageJson.version,
      type: "module",
      "isle.extension": pkg.manifest,
    };
    for (const key of ["description", "license", "keywords"]) {
      if (pkg.packageJson[key] !== undefined) artifact[key] = pkg.packageJson[key];
    }
    await writeFile(join(staging, "package.json"), JSON.stringify(artifact, null, 2) + "\n");
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
    if (conventional && (await realpath(parent)) !== parent) throw new Error("构建输出父目录不能为符号链接");
    try {
      const current = await lstat(output);
      if (!conventional || current.isSymbolicLink()) throw new Error("输出目录已存在或为符号链接");
      await rm(output, { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await cp(staging, output, { recursive: true, errorOnExist: true, force: false });
    return readExtensionPackage(output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function packExtensionPackage(directory, { outputDir } = {}) {
  const root = resolve(directory);
  const temp = await mkdtemp(join(tmpdir(), "isle-extension-pack-"));
  try {
    const pkg = await buildExtensionPackage(root, { outputDir: join(temp, "package") });
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
