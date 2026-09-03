import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

export type PluginUiContribution = Readonly<{
  kind: "sandbox";
  title?: string;
  layout?: "contained" | "full";
}>;

export type PluginUiDocument = Readonly<{
  script: string;
  style: string;
}>;

export type DshClientDeclarationInfo = Readonly<{
  declared: true;
  platform: string | null;
}>;

export type PluginUiManifestResult = Readonly<{
  contribution: PluginUiContribution | null;
  document: PluginUiDocument | null;
  error: string | null;
  dshClient: DshClientDeclarationInfo | null;
}>;

const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_SCRIPT_BYTES = 512 * 1024;
const MAX_STYLE_BYTES = 256 * 1024;

const asObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是对象。`);
  return value as Record<string, unknown>;
};

const optionalTitle = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("isle.ui.title 必须是非空字符串。");
  const title = value.trim();
  if (title.length > 100) throw new Error("isle.ui.title 不能超过 100 个字符。");
  return title;
};

const optionalLayout = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value !== "contained" && value !== "full") {
    throw new Error("isle.ui.layout 只支持 contained 或 full。");
  }
  return value;
};

const relativeEntry = (value: unknown, field: string, extensions: readonly string[]) => {
  if (typeof value !== "string" || !value.startsWith("./")) {
    throw new Error(`${field} 必须是以 ./ 开头的包内相对路径。`);
  }
  const extension = extname(value).toLowerCase();
  if (!extensions.includes(extension)) throw new Error(`${field} 只支持 ${extensions.join("、")} 文件。`);
  return value;
};

const readPackageFile = async (packageRoot: string, entry: string, maxBytes: number, label: string) => {
  const root = await realpath(packageRoot);
  const target = await realpath(resolve(root, entry));
  const inside = relative(root, target);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`${label} 必须位于插件包目录内。`);
  const metadata = await stat(target);
  if (!metadata.isFile()) throw new Error(`${label} 不是普通文件。`);
  if (metadata.size > maxBytes) throw new Error(`${label} 超过 ${Math.floor(maxBytes / 1024)} KiB 上限。`);
  return readFile(target, "utf8");
};

const dshClientInfo = (manifest: Record<string, unknown>): DshClientDeclarationInfo | null => {
  const dsh = manifest.dsh;
  if (!dsh || typeof dsh !== "object" || Array.isArray(dsh)) return null;
  const client = (dsh as Record<string, unknown>).client;
  if (client === undefined) return null;
  const platform =
    client && typeof client === "object" && !Array.isArray(client)
      ? (client as Record<string, unknown>).platform
      : undefined;
  return { declared: true, platform: typeof platform === "string" ? platform : null };
};

/** Read Isle's additive UI declaration without evaluating plugin browser code. */
export const loadPluginUiManifest = async (packageRoot: string): Promise<PluginUiManifestResult> => {
  let manifest: Record<string, unknown>;
  try {
    const text = await readPackageFile(packageRoot, "./package.json", MAX_MANIFEST_BYTES, "插件 package.json");
    manifest = asObject(JSON.parse(text), "插件 package.json");
  } catch (error) {
    return {
      contribution: null,
      document: null,
      error: error instanceof Error ? error.message : String(error),
      dshClient: null,
    };
  }

  const dshClient = dshClientInfo(manifest);
  try {
    const isle = manifest.isle;
    if (isle === undefined) return { contribution: null, document: null, error: null, dshClient };
    const uiValue = asObject(isle, "isle").ui;
    if (uiValue === undefined) return { contribution: null, document: null, error: null, dshClient };
    const ui = asObject(uiValue, "isle.ui");
    if (ui.version !== 1) throw new Error("isle.ui.version 当前只支持 1。");
    const title = optionalTitle(ui.title);

    if (ui.kind === "sandbox") {
      const layout = optionalLayout(ui.layout);
      const entry = relativeEntry(ui.entry, "isle.ui.entry", [".js", ".mjs"]);
      const style = ui.style === undefined ? undefined : relativeEntry(ui.style, "isle.ui.style", [".css"]);
      const [script, stylesheet] = await Promise.all([
        readPackageFile(packageRoot, entry, MAX_SCRIPT_BYTES, "isle.ui.entry"),
        style ? readPackageFile(packageRoot, style, MAX_STYLE_BYTES, "isle.ui.style") : Promise.resolve(""),
      ]);
      return {
        contribution: {
          kind: "sandbox",
          ...(title ? { title } : {}),
          ...(layout ? { layout } : {}),
        },
        document: { script, style: stylesheet },
        error: null,
        dshClient,
      };
    }

    throw new Error(`isle.ui.kind 不受支持：${String(ui.kind)}`);
  } catch (error) {
    return {
      contribution: null,
      document: null,
      error: error instanceof Error ? error.message : String(error),
      dshClient,
    };
  }
};
