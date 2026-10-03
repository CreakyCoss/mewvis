import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, PanelTop, RotateCcw } from "lucide-react";
import {
  getApplicationHost,
  writeClipboardText,
  type ApplicationHostInfo,
} from "@mewvis/app-sdk/browser";
import { CodeExample, Feedback, PageHeading, errorText } from "./Example";

export const hostCode = [
  'import { getApplicationHost, writeClipboardText } from "@mewvis/app-sdk/browser";',
  "",
  "const host = getApplicationHost();",
  "const info = host.getHost();",
  "// 只在用户点击操作中执行。",
  'await writeClipboardText("来自我的应用");',
  'await host.openExternal("https://example.com");',
  "",
  'const result = await host.header?.set({ title: "我的应用", backLabel: "返回" });',
  "// 仅在 result?.supported 为 true 时收起应用自己的导航。",
  "await host.header?.set(null);",
].join("\n");

export function HostExamples({ onBack }: { onBack(): void }) {
  const [info, setInfo] = useState<ApplicationHostInfo | null>(null);
  const [text, setText] = useState("来自 Mewvis 应用能力实验室");
  const [url, setUrl] = useState("https://example.com");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [headerAvailable, setHeaderAvailable] = useState(false);
  const [headerActive, setHeaderActive] = useState(false);
  const headerRequested = useRef(false);
  useEffect(() => {
    const refresh = () => {
      try {
        const next = getApplicationHost().getHost();
        setInfo(next ? { ...next } : null);
      } catch (error) {
        setError(errorText(error));
      }
    };
    refresh();
    window.addEventListener("mewvis:theme", refresh);
    window.addEventListener("mewvis:ready", refresh);
    let unsubscribe: (() => void) | undefined;
    try {
      const header = getApplicationHost().header;
      setHeaderAvailable(!!header);
      unsubscribe = header?.subscribe((action) => {
        if (action === "back") onBack();
      });
    } catch (error) {
      setError(errorText(error));
    }
    return () => {
      window.removeEventListener("mewvis:theme", refresh);
      window.removeEventListener("mewvis:ready", refresh);
      unsubscribe?.();
      if (headerRequested.current) {
        try {
          void getApplicationHost()
            .header?.set(null)
            .catch(() => {});
        } catch {
          // The host bridge may already be gone while the app is closing.
        }
        headerRequested.current = false;
      }
    };
  }, [onBack]);
  const run = async (action: () => Promise<string>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
    } catch (error) {
      setError(errorText(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const setHeader = (active: boolean) =>
    run(async () => {
      const header = getApplicationHost().header;
      if (!header)
        throw new Error(
          "当前宿主不提供公共顶栏。请在支持的 Mewvis 版本中体验。",
        );
      headerRequested.current = active;
      const result = await header.set(
        active
          ? { title: "调试台 · 顶栏示例", backLabel: "返回能力总览" }
          : null,
      );
      setHeaderActive(active && result.supported);
      return result.supported
        ? active
          ? "已设置宿主顶栏，可点击宿主返回按钮回到总览。"
          : "已恢复宿主顶栏。"
        : "当前宿主不支持公共顶栏，应用内导航继续可用。";
    });
  return (
    <>
      <PageHeading
        title="与宿主自然协作"
        description="跟随主题、复用顶栏，并通过用户操作复制内容和打开外部链接。"
      />
      <div className="showcase-host-grid">
        <section className="showcase-panel showcase-panel-body">
          <span className="showcase-kicker">外观与身份</span>
          <h2>读取宿主，跟随主题</h2>
          <p className="showcase-muted">
            在宿主切换深浅主题，应用与内嵌视图会一起更新。
          </p>
          <dl className="showcase-result-table">
            <div>
              <dt>当前主题</dt>
              <dd>
                {info ? (info.theme === "dark" ? "深色" : "浅色") : "等待宿主"}
              </dd>
            </div>
            <div>
              <dt>应用</dt>
              <dd>{info?.application.name ?? "—"}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{info?.application.version ?? "—"}</dd>
            </div>
          </dl>
          <p className="showcase-mono showcase-muted">{info?.application.id}</p>
        </section>
        <section className="showcase-panel showcase-panel-body">
          <span className="showcase-kicker">公共顶栏</span>
          <h2>共享标题与返回入口</h2>
          <p className="showcase-muted">
            {headerAvailable
              ? "在宿主顶栏显示当前应用标题，并接收返回操作。"
              : "当前环境未提供公共顶栏；此示例需在 Mewvis 中体验。"}
          </p>
          <div className="showcase-actions">
            <button
              type="button"
              className="showcase-button"
              disabled={!headerAvailable || busy || headerActive}
              onClick={() => void setHeader(true)}
            >
              <PanelTop />
              设置宿主顶栏
            </button>
            <button
              type="button"
              className="showcase-text-button"
              disabled={!headerActive || busy}
              onClick={() => void setHeader(false)}
            >
              <RotateCcw />
              恢复
            </button>
          </div>
        </section>
        <section className="showcase-panel showcase-panel-body">
          <h2>复制一段文本</h2>
          <p className="showcase-muted">由点击触发，只写入剪贴板。</p>
          <label className="showcase-field-label" htmlFor="demo-clipboard">
            复制内容
          </label>
          <input
            id="demo-clipboard"
            value={text}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            className="showcase-button showcase-send-message"
            disabled={busy || !text}
            onClick={() =>
              void run(async () => {
                await writeClipboardText(text);
                return "已复制文本。";
              })
            }
          >
            <Copy />
            复制文本
          </button>
        </section>
        <section className="showcase-panel showcase-panel-body">
          <h2>打开外部链接</h2>
          <p className="showcase-muted">
            由宿主在系统浏览器打开 HTTP(S) 地址。
          </p>
          <label className="showcase-field-label" htmlFor="demo-external-url">
            链接地址
          </label>
          <input
            id="demo-external-url"
            type="url"
            value={url}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button
            type="button"
            className="showcase-button showcase-send-message"
            disabled={busy || !url.trim()}
            onClick={() =>
              void run(async () => {
                let target: URL;
                try {
                  target = new URL(url);
                } catch {
                  throw new Error("请输入完整的 HTTP(S) 地址。");
                }
                if (!["https:", "http:"].includes(target.protocol))
                  throw new Error("只支持 HTTP(S) 地址。");
                const result = await getApplicationHost().openExternal(
                  target.href,
                );
                if (!result.opened) throw new Error("宿主未打开链接，请重试。");
                return "已请求宿主打开链接。";
              })
            }
          >
            <ExternalLink />
            在浏览器打开
          </button>
        </section>
      </div>
      <Feedback error={error} message={message} />
      <CodeExample code={hostCode} />
    </>
  );
}
