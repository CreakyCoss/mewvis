import { getApplicationHost } from "@isle/app-sdk/browser";
import {
  getApplicationDataClient,
  type ApplicationWorkspace,
} from "@isle/app-sdk/data";

let running = 0;
const queue: Array<() => void> = [];
export async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (running >= 3) await new Promise<void>((resolve) => queue.push(resolve));
  running++;
  try {
    return (await getApplicationHost().executeTool<T>(name, args)).value;
  } finally {
    running--;
    queue.shift()?.();
  }
}
export const data = () => getApplicationDataClient();
let listing: Promise<ApplicationWorkspace[]> | undefined;
const workspaces = () =>
  (listing ??= data()
    .workspaces.list()
    .finally(() => {
      listing = undefined;
    }));
const normalize = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+$/, "");
export async function workspaceForPath(
  path: string,
): Promise<ApplicationWorkspace> {
  const result = (await workspaces()).find(
    (item) => normalize(item.path) === normalize(path),
  );
  if (!result) throw new Error("故事工作区尚未登记，请先导入故事。");
  return result;
}
export async function locationForPath(path: string) {
  const normalized = normalize(path);
  const workspace = (await workspaces())
    .filter(
      (item) =>
        normalized === normalize(item.path) ||
        normalized.startsWith(normalize(item.path) + "/"),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!workspace) throw new Error("工作区未登记");
  return {
    workspace,
    relativePath: normalized
      .slice(normalize(workspace.path).length)
      .replace(/^\//, ""),
  };
}
