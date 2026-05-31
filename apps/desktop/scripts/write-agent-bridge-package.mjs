import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const productConfigPath = join(desktopRoot, "product.config.json");
const codingAgentPackagePath = join(
  desktopRoot,
  "..",
  "..",
  "ai",
  "pi",
  "packages",
  "coding-agent",
  "package.json",
);
const outputDir = join(desktopRoot, "agent-bridge", "dist");
const outputPath = join(outputDir, "package.json");

const productConfig = JSON.parse(await readFile(productConfigPath, "utf8"));
const codingAgentPackage = JSON.parse(await readFile(codingAgentPackagePath, "utf8"));
const runtimePackage = {
  name: productConfig.agentBridgePackageName,
  version: codingAgentPackage.version ?? "0.0.0",
  private: true,
  type: "module",
  piConfig: codingAgentPackage.piConfig ?? { configDir: ".pi" },
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(runtimePackage, null, 2)}\n`);
