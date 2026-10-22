import type {
  ApplicationViewRequestContext,
  ApplicationViewValue,
} from "@mewvis/app-sdk/views";
import type { ApplicationFileClient } from "@mewvis/app-sdk/files";

type Params = Readonly<Record<string, ApplicationViewValue>>;
const LIMIT = 16 * 1024 * 1024;
const CHUNK = 48 * 1024;

/** The owner supplies identity and file access; the child cannot choose a root. */
export async function saveExportFile(
  files: ApplicationFileClient,
  viewId: string,
  bytes: Uint8Array,
  name: string,
  signal: AbortSignal,
) {
  const { dataPath } = await files.roots();
  const directory = `${dataPath}/exports/${viewId}`;
  signal.throwIfAborted();
  await files.mkdir(directory);
  const path = `${directory}/${crypto.randomUUID()}-${name}`;
  const id = await files.beginWrite(path);
  try {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
      signal.throwIfAborted();
      await files.writeChunk(
        id,
        offset,
        bytes.subarray(offset, offset + 64 * 1024),
      );
    }
    signal.throwIfAborted();
    await files.commitWrite(id);
    return path;
  } catch (error) {
    await files.abortWrite(id).catch(() => {});
    throw error;
  }
}

/** One bounded transfer per mounted view. Children supply bytes, never a path. */
export function createFileExports({
  viewId,
  passive,
  save,
}: {
  viewId: string;
  passive: boolean;
  save(bytes: Uint8Array, name: string, signal: AbortSignal): Promise<string>;
}) {
  let disposed = false;
  let pending: {
    id: string;
    name: string;
    size: number;
    offset: number;
    bytes: Uint8Array;
  } | null = null;
  let finishing = false;
  const check = (
    params: Params,
    context: ApplicationViewRequestContext,
    fields: string[],
  ) => {
    context.signal.throwIfAborted();
    if (
      disposed ||
      passive ||
      context.viewId !== viewId ||
      Object.keys(params).some((key) => !fields.includes(key))
    )
      throw new Error("当前视图不能导出文件。");
  };
  const transfer = (id: ApplicationViewValue) => {
    if (!pending || pending.id !== id)
      throw new Error("导出任务不存在或已结束。");
    return pending;
  };
  return {
    dispose() {
      disposed = true;
      pending = null;
    },
    methods: {
      "file.export.begin": async (
        params: Params,
        context: ApplicationViewRequestContext,
      ) => {
        check(params, context, ["name", "size", "mime"]);
        if (finishing) throw new Error("请等待当前文件保存完成。");
        const { name, size, mime } = params;
        if (
          typeof name !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.(png|html|json)$/.test(name) ||
          typeof size !== "number" ||
          !Number.isSafeInteger(size) ||
          size < 1 ||
          size > LIMIT ||
          mime !==
            (
              {
                png: "image/png",
                html: "text/html;charset=utf-8",
                json: "application/json",
              } as Record<string, string>
            )[name.split(".").at(-1)!]
        )
          throw new Error("仅支持导出 16 MiB 以内的 PNG、HTML 或 JSON 文件。");
        pending = {
          id: crypto.randomUUID(),
          name,
          size,
          offset: 0,
          bytes: new Uint8Array(size),
        };
        return { id: pending.id };
      },
      "file.export.chunk": async (
        params: Params,
        context: ApplicationViewRequestContext,
      ) => {
        check(params, context, ["id", "offset", "data"]);
        const item = transfer(params.id);
        if (
          params.offset !== item.offset ||
          typeof params.data !== "string" ||
          params.data.length === 0 ||
          params.data.length > (CHUNK / 3) * 4 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            params.data,
          )
        )
          throw new Error("导出数据块或顺序无效。");
        const raw = atob(params.data);
        if (!raw.length || item.offset + raw.length > item.size)
          throw new Error("导出数据超过声明大小。");
        item.bytes.set(
          Uint8Array.from(raw, (c) => c.charCodeAt(0)),
          item.offset,
        );
        item.offset += raw.length;
        return null;
      },
      "file.export.finish": async (
        params: Params,
        context: ApplicationViewRequestContext,
      ) => {
        check(params, context, ["id"]);
        const item = transfer(params.id);
        if (item.offset !== item.size)
          throw new Error("导出数据尚未完整接收。");
        pending = null;
        finishing = true;
        try {
          const path = await save(item.bytes, item.name, context.signal);
          return { path };
        } finally {
          finishing = false;
        }
      },
      "file.export.cancel": async (
        params: Params,
        context: ApplicationViewRequestContext,
      ) => {
        check(params, context, ["id"]);
        transfer(params.id);
        pending = null;
        return null;
      },
    },
  };
}
