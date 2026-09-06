import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { exists } from "./project.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function createReactPlugin({ destination, name, local }) {
  const root = resolve(destination);
  if (await exists(root)) throw new Error(`目标目录已经存在：${root}`);
  const slug = root
    .split(/[\\/]/)
    .at(-1)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
  const packageName = name ?? `@isle/${slug}`;
  if (
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName) ||
    packageName.length > 214
  )
    throw new Error(`插件包名无效：${packageName}`);
  const tool =
    packageName.replace(/[^a-z0-9]+/g, "_").replace(/^_/, "") + "_inspect_text";
  const manifest = {
    name: packageName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "isle-plugin dev",
      build: "isle-plugin build",
      check: "isle-plugin check",
    },
    dependencies: {
      "@isle/plugin-sdk": local
        ? `link:${dirname(createRequire(import.meta.url).resolve("@isle/plugin-sdk"))}`
        : "^0.1.0",
      react: "^19.1.0",
      "react-dom": "^19.1.0",
    },
    devDependencies: {
      "@isle/plugin-dev": local ? `link:${packageRoot}` : "^0.1.0",
      "@types/react": "^19.1.8",
      "@types/react-dom": "^19.1.6",
      "@types/node": "^22.0.0",
    },
  };
  async function copy(from, to) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.isDirectory())
        await copy(join(from, entry.name), join(to, entry.name));
      else
        await writeFile(
          join(to, entry.name === "gitignore" ? ".gitignore" : entry.name),
          (await readFile(join(from, entry.name), "utf8"))
            .replaceAll("__PLUGIN_NAME__", packageName)
            .replaceAll("__TOOL_NAME__", tool)
            .replaceAll(
              "__SKILL_NAME__",
              tool
                .replaceAll("_", "-")
                .replace(/-inspect-text$/, "-text-inspection"),
            ),
        );
    }
  }
  await copy(join(packageRoot, "templates/react"), root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return { root, name: packageName };
}
