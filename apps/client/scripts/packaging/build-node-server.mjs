import { build } from "esbuild";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile, stat, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("../../", import.meta.url));
const server = join(desktop, "../server");
const resources = join(desktop, "../agent-runtime/dist");
const output = join(resources, "server");
const serverRequire = createRequire(join(server, "package.json"));
const targetIndex = process.argv.indexOf("--target");
if (targetIndex !== -1 && !process.argv[targetIndex + 1])
  throw new Error("--target requires a platform-architecture value");
const target =
  (targetIndex !== -1 ? process.argv[targetIndex + 1] : process.env.NODE_RUNTIME_TARGET) ??
  `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
if (!/^(win|darwin|linux)-(x64|arm64)$/.test(target)) throw new Error(`Unsupported Node backend target: ${target}`);
if (target === "win-arm64") throw new Error("sqlite-vec 0.1.9 尚无 Windows ARM64 产物，不能生成该平台的 Node 后端包");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [join(server, "src/cli.ts")],
  outfile: join(output, "cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["sqlite-vec", "fs-native-extensions", "fs-ext"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

// Native modules retain their package layout; no symlinks into the source checkout are shipped.
const copied = new Map();
async function copyPackage(name, resolver = serverRequire) {
  let root;
  for (const directory of resolver.resolve.paths(name) ?? []) {
    const candidate = join(directory, name);
    try {
      await stat(join(candidate, "package.json"));
      root = await realpath(candidate);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!root) throw new Error(`Package not installed: ${name}`);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (copied.has(name)) {
    if (copied.get(name) !== pkg.version) throw new Error(`Conflicting native dependency: ${name}`);
    return;
  }
  copied.set(name, pkg.version);
  const destination = join(output, "node_modules", name);
  await cp(root, destination, {
    recursive: true,
    dereference: true,
    filter: (source) =>
      source === root ||
      !source
        .slice(root.length + 1)
        .split(/[\\/]/)
        .includes("node_modules"),
  });
  const resolveDependency = createRequire(join(root, "package.json"));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyPackage(dependency, resolveDependency);
}
await copyPackage("sqlite-vec");
const vecTarget = `sqlite-vec-${target.replace(/^win-/, "windows-")}`;
try {
  await copyPackage(vecTarget, createRequire(serverRequire.resolve("sqlite-vec")));
} catch (error) {
  throw new Error(`缺少目标平台依赖 ${vecTarget}，请在目标平台安装依赖后打包`, { cause: error });
}
if (target.startsWith("linux-")) {
  if (target !== `${process.platform}-${process.arch}`) throw new Error("Linux 文件锁模块需要在目标平台构建");
  await copyPackage("fs-ext");
} else {
  await copyPackage("fs-native-extensions");
  const nativeTarget = target.replace(/^win-/, "win32-");
  await stat(join(output, "node_modules/fs-native-extensions/prebuilds", nativeTarget));
}
await writeFile(join(output, "package.json"), JSON.stringify({ private: true, type: "module" }) + "\n");
await cp(join(desktop, "../product.config.json"), join(resources, "product.config.json"));
for (const [source, destination] of [
  ["../agent-runtime/protocol/v1", "protocol/v1"],
  ["resources/skills", "skills"],
]) {
  await rm(join(resources, destination), { recursive: true, force: true });
  await cp(join(desktop, source), join(resources, destination), { recursive: true });
}
console.log(`Node backend bundled for ${target}: ${output}`);
