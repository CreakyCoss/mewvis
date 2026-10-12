import { useEffect, useRef, useState } from "react";
import {
  FileImage,
  FileText,
  Image,
  Music2,
  Square,
  Upload,
} from "lucide-react";
import {
  getApplicationFileClient,
  type ApplicationFileInfo,
  type ApplicationFileRoots,
} from "@mewvis/app-sdk/files";
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";
import { CodeExample, Feedback, PageHeading, errorText } from "./Example";

export const filesCode = [
  'import { getApplicationFileClient } from "@mewvis/app-sdk/files";',
  'import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";',
  "",
  "const files = getApplicationFileClient();",
  "const { dataPath } = await files.roots();",
  "const filePath = `${dataPath}/files/example.txt`;",
  'await files.writeText(filePath, "文件预览示例");',
  "",
  "<FilePreview filePath={filePath} style={{ height: 360 }} />",
  "<FilePreviewDialog filePath={filePath} open={open} onOpenChange={setOpen} />",
  "",
  "// 普通 JS 页面也可以指定自己的容器。",
  "const view = await files.preview.open(container, { filePath });",
  "await view.ready;",
  "await view.close();",
].join("\n");

function pdfSample() {
  const content = "BT /F1 22 Tf 40 200 Td (Mewvis File Preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = document.length;
  document += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(document);
}

function audioSample() {
  const samples = 8000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) =>
    bytes.set(new TextEncoder().encode(value), offset);
  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, samples, true);
  view.setUint32(28, samples * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++)
    view.setInt16(
      44 + index * 2,
      Math.sin((index * 2 * Math.PI * 440) / samples) * 5000,
      true,
    );
  return bytes;
}

const samples = [
  {
    label: "图片示例",
    name: "image.svg",
    icon: Image,
    content: () =>
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="16" fill="#eef0ff"/><circle cx="320" cy="140" r="60" fill="#625ce8"/><text x="320" y="265" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#23232d">Mewvis File Preview</text></svg>',
      ),
  },
  {
    label: "文本示例",
    name: "example.txt",
    icon: FileText,
    content: () =>
      new TextEncoder().encode(
        "文件预览示例\n\n这段文本通过应用文件 SDK 保存，再由宿主提供只读预览。\n页面内预览与宿主弹窗使用同一套渲染器。",
      ),
  },
  { label: "音频示例", name: "tone.wav", icon: Music2, content: audioSample },
  {
    label: "PDF 示例",
    name: "document.pdf",
    icon: FileText,
    content: pdfSample,
  },
];

export function FileExamples() {
  const [roots, setRoots] = useState<ApplicationFileRoots>();
  const [path, setPath] = useState("");
  const [active, setActive] = useState<ApplicationFileInfo>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const operation = useRef<AbortController | undefined>(undefined);
  const upload = useRef<HTMLInputElement>(null);
  const samplePaths = useRef(new Map<string, string>());

  const run = async (
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (operation.current === controller) operation.current = undefined;
      if (!controller.signal.aborted) setBusy("");
    }
  };

  useEffect(() => {
    void run("读取可用目录", async (signal) => {
      const value = await getApplicationFileClient().roots();
      signal.throwIfAborted();
      setRoots(value);
    });
    return () => {
      operation.current?.abort();
      operation.current = undefined;
    };
  }, []);

  const close = () => {
    setActive(undefined);
    setDialogOpen(false);
  };
  const preview = (dialog = false) =>
    run("打开文件", async (signal) => {
      close();
      const file = await getApplicationFileClient().stat(path.trim());
      signal.throwIfAborted();
      if (file.type !== "file")
        throw new Error("请输入文件的完整路径，不能预览目录。");
      setActive(file);
      setDialogOpen(dialog);
    });
  const sample = (item: (typeof samples)[number]) =>
    run("准备示例文件", async (signal) => {
      close();
      const files = getApplicationFileClient();
      const directories = roots ?? (await files.roots());
      signal.throwIfAborted();
      setRoots(directories);
      let filePath = samplePaths.current.get(item.name);
      if (!filePath) {
        filePath = `${directories.dataPath}/files/preview-examples/${crypto.randomUUID()}/${item.name}`;
        await files.writeBinary(filePath, item.content());
        signal.throwIfAborted();
        samplePaths.current.set(item.name, filePath);
      }
      const file = await files.stat(filePath);
      signal.throwIfAborted();
      setPath(filePath);
      setActive(file);
      setMessage("示例已保存到应用数据目录，可切换为弹窗预览。");
    });
  const importFile = (file: File) =>
    run("保存本地文件", async (signal) => {
      close();
      const files = getApplicationFileClient();
      const directories = roots ?? (await files.roots());
      signal.throwIfAborted();
      setRoots(directories);
      const name = file.name.replace(/[\\/<>:"|?*\x00-\x1f]/g, "_") || "file";
      const filePath = `${directories.dataPath}/files/preview-imports/${crypto.randomUUID()}/${name}`;
      const id = await files.beginWrite(filePath);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        signal.throwIfAborted();
        reader = file.stream().getReader();
        let offset = 0;
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          for (let index = 0; index < value.length; index += 64 * 1024) {
            signal.throwIfAborted();
            const chunk = value.subarray(index, index + 64 * 1024);
            await files.writeChunk(id, offset, chunk);
            offset += chunk.length;
          }
        }
        signal.throwIfAborted();
        const saved = await files.commitWrite(id);
        signal.throwIfAborted();
        setPath(filePath);
        setActive(saved);
        setMessage("已将本地文件副本保存到应用数据目录。");
      } catch (reason) {
        await files.abortWrite(id).catch(() => {});
        throw reason;
      } finally {
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
    });

  return (
    <>
      <PageHeading
        title="在应用里查看文件"
        description="把文件显示在页面自己的区域，或打开宿主预览弹窗。图片、音视频、PDF 和文本使用同一套预览能力。"
      />
      <div className="showcase-split-panel">
        <section className="showcase-panel-body" aria-label="选择预览文件">
          <h2>先试一个示例</h2>
          <p className="showcase-muted">
            点击后在应用目录保存示例文件，并显示实际内容。
          </p>
          <div className="showcase-actions">
            {samples.map((item) => (
              <button
                key={item.name}
                type="button"
                className="showcase-button"
                disabled={!!busy}
                onClick={() => void sample(item)}
              >
                <item.icon aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
          <div>
            <label className="showcase-field-label" htmlFor="demo-preview-path">
              文件完整路径
            </label>
            <input
              id="demo-preview-path"
              value={path}
              placeholder="应用数据目录或已登记工作区内的文件"
              disabled={!!busy}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && path.trim()) {
                  event.preventDefault();
                  void preview();
                }
              }}
            />
            <div className="showcase-actions">
              <button
                type="button"
                className="showcase-button is-primary"
                disabled={!!busy || !path.trim()}
                onClick={() => void preview()}
              >
                <FileImage aria-hidden="true" />
                页面内预览
              </button>
              <button
                type="button"
                className="showcase-button"
                disabled={!!busy || !path.trim()}
                onClick={() => void preview(true)}
              >
                弹窗预览
              </button>
            </div>
          </div>
          <div className="showcase-file-import">
            <input
              ref={upload}
              type="file"
              hidden
              aria-label="选择要导入的本地文件"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
            <button
              type="button"
              className="showcase-button"
              disabled={!!busy}
              onClick={() => upload.current?.click()}
            >
              <Upload aria-hidden="true" />
              导入本地文件
            </button>
            <p className="showcase-muted">
              保存副本到应用目录后预览，可体验自己的图片、视频和文档。
            </p>
          </div>
          {roots && (
            <details className="showcase-file-roots">
              <summary>查看可用目录</summary>
              <p className="showcase-muted">应用数据目录</p>
              <code>{roots.dataPath}</code>
              {!!roots.workspacePaths.length && (
                <p className="showcase-muted">已登记工作区</p>
              )}
              {roots.workspacePaths.map((directory) => (
                <code key={directory}>{directory}</code>
              ))}
            </details>
          )}
          {!!busy && (
            <p className="showcase-muted" role="status">
              正在{busy}…
            </p>
          )}
          <Feedback error={error} message={message} />
        </section>
        <section
          className="showcase-panel-body showcase-panel-result"
          aria-label="页面内文件预览"
        >
          <div className="showcase-inline-heading">
            <h2>页面内预览</h2>
            <button
              type="button"
              className="showcase-text-button"
              disabled={!active || !!busy}
              onClick={close}
            >
              <Square aria-hidden="true" />
              关闭预览
            </button>
          </div>
          <p className="showcase-muted">
            预览区域由应用布局，文件访问由宿主检查。
          </p>
          <div className="showcase-file-stage">
            {active ? (
              <FilePreview filePath={active.filePath} />
            ) : (
              <div className="showcase-empty">
                <FileImage aria-hidden="true" />
                <p>选择示例、导入文件或输入路径，查看文件内容。</p>
              </div>
            )}
          </div>
          {active && (
            <div className="showcase-file-summary">
              <strong>{active.name}</strong>
              <span>
                {active.size < 1024
                  ? `${active.size} B`
                  : `${(active.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`}
              </span>
              <code>{active.filePath}</code>
            </div>
          )}
          <p className="showcase-muted">
            不支持的格式会明确提示；文本按纯文本显示，PDF 按页浏览。
          </p>
        </section>
      </div>
      {active && (
        <FilePreviewDialog
          filePath={active.filePath}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
      <CodeExample code={filesCode} />
    </>
  );
}
