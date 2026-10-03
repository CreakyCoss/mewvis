import { productId } from "@mewvis/product-config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const versionRequirePattern =
  /const \{ version \} = createRequire\(import\.meta\.url\)\(["']\.\.\/package\.json["']\);/;

/**
 * dsh-llm reads ../package.json at module evaluation time. Once esbuild folds
 * that module into a different output directory the relative require no longer
 * points at the package, so inline the package version while loading the source.
 */
export const dshBundleCompatibilityPlugin = {
  name: productId("-dsh-bundle-compatibility"),
  setup(build) {
    build.onLoad(
      { filter: /[\\/]@deepseek-ai[\\/]dsh-llm[\\/]lib[\\/]index\.js$/ },
      async (args) => {
        const source = await readFile(args.path, "utf8");
        if (!versionRequirePattern.test(source)) {
          throw new Error(`无法识别 dsh-llm 的版本读取语句：${args.path}`);
        }
        const manifest = JSON.parse(
          await readFile(
            join(dirname(args.path), "..", "package.json"),
            "utf8",
          ),
        );
        return {
          contents: source.replace(
            versionRequirePattern,
            `const version = ${JSON.stringify(manifest.version)};`,
          ),
          loader: "js",
        };
      },
    );
  },
};
