import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

export type ApplicationUiContribution = Readonly<{
  kind: "sandbox";
  title?: string;
  layout?: "contained" | "full" | "fullscreen";
}>;

export type ApplicationUiDocument = Readonly<{
  script: string;
  style: string;
}>;

export type ApplicationCompatibilityInfo = Readonly<{
  adapter: "dsh";
  clientPlatform?: string | null;
}>;

export type ApplicationUiManifestResult = Readonly<{
  contribution: ApplicationUiContribution | null;
  document: ApplicationUiDocument | null;
  error: string | null;
  compatibility: readonly ApplicationCompatibilityInfo[];
}>;

const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_STYLE_BYTES = 2 * 1024 * 1024;

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
  if (value !== "contained" && value !== "full" && value !== "fullscreen") {
    throw new Error("isle.ui.layout 只支持 contained、full 或 fullscreen。");
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
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`${label} 必须位于应用包目录内。`);
  const metadata = await stat(target);
  if (!metadata.isFile()) throw new Error(`${label} 不是普通文件。`);
  if (metadata.size > maxBytes) throw new Error(`${label} 超过 ${Math.floor(maxBytes / 1024)} KiB 上限。`);
  return readFile(target, "utf8");
};

const compatibilityInfo = (manifest: Record<string, unknown>): readonly ApplicationCompatibilityInfo[] => {
  const dsh = manifest.dsh;
  if (!dsh || typeof dsh !== "object" || Array.isArray(dsh)) return [];
  const client = (dsh as Record<string, unknown>).client;
  if (client === undefined) return [{ adapter: "dsh" }];
  const platform =
    client && typeof client === "object" && !Array.isArray(client)
      ? (client as Record<string, unknown>).platform
      : undefined;
  return [{ adapter: "dsh", clientPlatform: typeof platform === "string" ? platform : null }];
};

/** Read Isle's additive UI declaration without evaluating application browser code. */
export const loadApplicationUiManifest = async (packageRoot: string): Promise<ApplicationUiManifestResult> => {
  let manifest: Record<string, unknown>;
  try {
    const text = await readPackageFile(packageRoot, "./package.json", MAX_MANIFEST_BYTES, "应用 package.json");
    manifest = asObject(JSON.parse(text), "应用 package.json");
  } catch (error) {
    return {
      contribution: null,
      document: null,
      error: error instanceof Error ? error.message : String(error),
      compatibility: [],
    };
  }

  const compatibility = compatibilityInfo(manifest);
  try {
    const isle = manifest.isle;
    if (isle === undefined) return { contribution: null, document: null, error: null, compatibility };
    const uiValue = asObject(isle, "isle").ui;
    if (uiValue === undefined) return { contribution: null, document: null, error: null, compatibility };
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
        compatibility,
      };
    }

    throw new Error(`isle.ui.kind 不受支持：${String(ui.kind)}`);
  } catch (error) {
    return {
      contribution: null,
      document: null,
      error: error instanceof Error ? error.message : String(error),
      compatibility,
    };
  }
};
