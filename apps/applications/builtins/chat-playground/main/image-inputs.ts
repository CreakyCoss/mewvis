import type { MessagePart } from "@mewvis/app-sdk/chat";
import type {
  ApplicationFileClient,
  ApplicationFileInfo,
} from "@mewvis/app-sdk/files";
import type { ChatPreset } from "./examples";

export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export type WorkspaceImage = {
  workspacePath: string;
  file: ApplicationFileInfo;
};

function imageExtension(bytes: Uint8Array): string {
  const starts = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (starts([255, 216, 255])) return "jpg";
  const text = new TextDecoder("ascii").decode(bytes);
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return "gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "webp";
  throw new Error(
    "请选择 PNG、JPEG、WebP 或 GIF 图片；文件内容需与图片格式一致。",
  );
}

/** A unique copy in this chat's workspace; incomplete writes are aborted. */
export async function importWorkspaceImage(
  files: Pick<
    ApplicationFileClient,
    "beginWrite" | "writeChunk" | "commitWrite" | "abortWrite"
  >,
  workspacePath: string,
  file: File,
  signal: AbortSignal,
): Promise<WorkspaceImage> {
  signal.throwIfAborted();
  if (!workspacePath.trim()) throw new Error("当前聊天工作区目录不可用。");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("请选择非空且不超过 16 MiB 的图片。");
  const extension = imageExtension(
    new Uint8Array(await file.slice(0, 16).arrayBuffer()),
  );
  signal.throwIfAborted();
  const name =
    file.name
      .replace(/\.[^.]*$/, "")
      .replace(/[\\/<>:"|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "image";
  const path = `${workspacePath.replace(/[\\/]+$/, "")}/media-inputs/${crypto.randomUUID()}/${name}.${extension}`;
  const id = await files.beginWrite(path);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    reader = file.stream().getReader();
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      for (let start = 0; start < value.length; start += 64 * 1024) {
        signal.throwIfAborted();
        const chunk = value.subarray(start, start + 64 * 1024);
        await files.writeChunk(id, offset, chunk);
        offset += chunk.length;
      }
    }
    if (offset !== file.size) throw new Error("图片读取不完整，请重新导入。");
    signal.throwIfAborted();
    const saved = await files.commitWrite(id);
    signal.throwIfAborted();
    return { workspacePath, file: saved };
  } catch (error) {
    await files.abortWrite(id).catch(() => {});
    throw error;
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

export function imageInputDraft(example: ChatPreset, filePath: string) {
  if (!example.imageInput) throw new Error("请选择图片输入示例。");
  const generation = example.mediaPurpose
    ? `\n\n请使用 generate_media，先用 action=list 查询当前模型的 ${example.mediaPurpose} 用途，再按返回的 inputSchema 和可覆盖参数执行一次 action=generate，purpose 固定为 ${example.mediaPurpose}。通过 files 数组引用本地图片：filePath 使用下方素材的完整路径，pointer 指向 Schema 对应的图片字段，format 按字段要求选择 data-url 或 base64，并在 input 中准备好父级结构。不要手动读取或拼接图片的 Base64，不猜测字段名；若 Schema 无法接收所需参考图或首帧，不丢弃图片改为纯文字生成，使用 ask_user 等待我处理。必填信息不足时同样等待确认，不编造参数或切换模型、用途。产物保存到当前工作区的 generated-media。以工具实际返回的状态和路径说明结果，不声称已检查产物。失败或停止后不要自动重新提交生成请求。`
    : "";
  const content = `${example.text}${generation}\n\n本地素材完整路径：${JSON.stringify(filePath)}\n参考图片：`;
  const reference = /[\s，。；,;]/.test(filePath)
    ? `@"${filePath}"`
    : `@${filePath}`;
  const blocks: MessagePart[] = [
    { type: "text", content },
    { type: "file-reference", path: filePath },
  ];
  return { text: content + reference, blocks };
}

export const imageInputCode = [
  'import { getApplicationDataClient } from "@mewvis/app-sdk/data";',
  'import { getApplicationFileClient } from "@mewvis/app-sdk/files";',
  'import { FilePreview } from "@mewvis/app-sdk/files/react";',
  "",
  "// workspaceId 来自当前聊天连接，不使用工作区列表中正在浏览的目录。",
  "const workspace = await getApplicationDataClient().workspaces.get(workspaceId);",
  "const files = getApplicationFileClient();",
  "// 校验 PNG/JPEG/WebP/GIF 文件头和 16 MiB 上限，再用 beginWrite /",
  "// writeChunk（每块最多 64 KiB）/ commitWrite 保存到 workspace.path。",
  "// 取消或失败调用 abortWrite，文件名清理后加随机目录防止覆盖。",
  "const filePath = `${workspace.path}/media-inputs/${crypto.randomUUID()}/reference.png`;",
  "await files.writeBinary(filePath, validatedImageBytes);",
  "",
  "// 在 Chat.Provider 内，先检查对话 input:image + read 工具，",
  "// 或媒体用途 input:text,image + generate_media 工具，再填入草稿。",
  'const text = `请使用 read 读取本地图片后描述画面。参考图片：@"${filePath}"`;',
  "composer.setDraft({",
  "  text,",
  "  blocks: [",
  '    { type: "text", content: "请使用 read 读取本地图片后描述画面。参考图片：" },',
  '    { type: "file-reference", path: filePath },',
  "  ],",
  "});",
  "// 文件引用指向素材，图片理解仍需 read 实际读取。图片编辑／图生视频",
  "// 使用 generate_media.files 绑定到实际 Schema 对应的字段。",
  "<FilePreview filePath={filePath} style={{ height: 180 }} />",
].join("\n");
