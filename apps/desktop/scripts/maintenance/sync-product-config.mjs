import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const productConfigPath = join(desktopRoot, "product.config.json");
const indexPath = join(desktopRoot, "index.html");
const tauriConfigPath = join(desktopRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = join(desktopRoot, "src-tauri", "Cargo.toml");

const productConfig = JSON.parse(await readFile(productConfigPath, "utf8"));

await syncIndexHtml();
await syncTauriConfig();
await syncCargoToml();

console.log(`Synced product config from ${productConfigPath}`);

async function syncIndexHtml() {
  const source = await readFile(indexPath, "utf8");
  const next = source
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(productConfig.displayName)}</title>`)
    .replace(
      /aria-label="[^"]*正在启动"/,
      `aria-label="${escapeHtmlAttribute(`${productConfig.displayName} 正在启动`)}"`,
    )
    .replace(
      /(<h1 class="startup-screen__brand-name">)[^<]*(<\/h1>)/,
      `$1${escapeHtml(productConfig.displayName)}$2`,
    );

  await writeFile(indexPath, next, "utf8");
}

async function syncTauriConfig() {
  const source = await readFile(tauriConfigPath, "utf8");
  const config = JSON.parse(source);

  config.productName = productConfig.bundleName;
  config.identifier = productConfig.bundleIdentifier;
  for (const windowConfig of config.app?.windows ?? []) {
    windowConfig.title = productConfig.windowTitle;
  }

  await writeFile(tauriConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function syncCargoToml() {
  const source = await readFile(cargoTomlPath, "utf8");
  const next = source.replace(
    /^description = ".*"$/m,
    `description = ${JSON.stringify(productConfig.description)}`,
  );

  await writeFile(cargoTomlPath, next, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll("\"", "&quot;");
}
