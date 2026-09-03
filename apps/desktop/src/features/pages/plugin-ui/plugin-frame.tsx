import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  executeDshPluginUiTool,
  getDshPluginUiDocument,
  type DshPluginUiDocument,
  type DshPluginUiPlugin,
} from "@/api/plugins";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const CHANNEL = "isle-plugin-ui-v1";
const MAX_ARGUMENT_BYTES = 256 * 1024;
const MAX_CONCURRENT_CALLS = 4;
const MAX_EXTERNAL_URL_LENGTH = 4_096;

const BRIDGE_SOURCE = String.raw`
(() => {
  const channel = "isle-plugin-ui-v1";
  const pending = new Map();
  let nextId = 1;
  let host = null;
  const send = (message) => parent.postMessage({ channel, ...message }, "*");
  const api = Object.freeze({
    version: 1,
    executeTool(toolName, args = {}) {
      if (typeof toolName !== "string" || !toolName) return Promise.reject(new Error("toolName must be a non-empty string"));
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: "tool:execute", id, toolName, args });
      });
    },
    openExternal(url) {
      if (typeof url !== "string" || !url) return Promise.reject(new Error("url must be a non-empty string"));
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        return Promise.reject(new Error("openExternal must be called from a user action"));
      }
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: "host:open-external", id, url });
      });
    },
    getHost() {
      return host;
    },
  });
  Object.defineProperty(window, "islePlugin", { value: api, enumerable: true });
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || message.channel !== channel) return;
    if (message.type === "host:init") {
      host = Object.freeze(message.host);
      document.documentElement.dataset.theme = host.theme;
      dispatchEvent(new CustomEvent("isle:ready", { detail: host }));
      return;
    }
    if (message.type === "host:theme") {
      if (host) host = Object.freeze({ ...host, theme: message.theme });
      document.documentElement.dataset.theme = message.theme;
      dispatchEvent(new CustomEvent("isle:theme", { detail: message.theme }));
      return;
    }
    if (message.type !== "host:result" || typeof message.id !== "string") return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  addEventListener("error", (event) => send({ type: "plugin:error", message: event.message || "Plugin UI script failed" }));
  addEventListener("unhandledrejection", (event) => send({ type: "plugin:error", message: String(event.reason?.message || event.reason || "Unhandled rejection") }));
  send({ type: "plugin:ready" });
})();`;

const BASE_STYLE = `
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
:root[data-theme="dark"] { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body { background: transparent; color: CanvasText; }
button, input, textarea, select { font: inherit; }
`;

const escapeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
const escapeStyle = (value: string) => value.replace(/<\/style/gi, "<\\/style");

const sandboxDocument = (document: DshPluginUiDocument) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; img-src data: blob:; media-src 'none'; object-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <style>${escapeStyle(BASE_STYLE)}${escapeStyle(document.style)}</style>
  </head>
  <body>
    <script>${escapeScript(BRIDGE_SOURCE)}</script>
    <script>${escapeScript(document.script)}\n//# sourceURL=isle-plugin-ui.js</script>
  </body>
</html>`;

const messageObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const PluginFrame = ({ plugin }: { plugin: DshPluginUiPlugin }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inFlight = useRef(new Set<string>());
  const externalOpenInFlight = useRef(false);
  const frameLoadCount = useRef(0);
  const [uiDocument, setUiDocument] = useState<DshPluginUiDocument | null>(null);
  const [loadError, setLoadError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const [isFrameReady, setIsFrameReady] = useState(false);
  const source = useMemo(() => (uiDocument ? sandboxDocument(uiDocument) : ""), [uiDocument]);
  const toolNames = useMemo(() => new Set(plugin.tools.map((tool) => tool.name)), [plugin.tools]);

  useEffect(() => {
    let cancelled = false;
    setUiDocument(null);
    setLoadError("");
    setRuntimeError("");
    setNavigationBlocked(false);
    setIsFrameReady(false);
    frameLoadCount.current = 0;
    void getDshPluginUiDocument(plugin.id)
      .then((next) => {
        if (!cancelled) setUiDocument(next);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id]);

  useEffect(() => {
    const post = (message: Record<string, unknown>) =>
      iframeRef.current?.contentWindow?.postMessage({ channel: CHANNEL, ...message }, "*");
    const theme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
    const initialize = () =>
      post({
        type: "host:init",
        host: {
          plugin: { id: plugin.id, name: plugin.name, version: plugin.version },
          theme: theme(),
          tools: plugin.tools,
        },
      });
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = messageObject(event.data);
      if (!message || message.channel !== CHANNEL) return;
      if (message.type === "plugin:ready") {
        setIsFrameReady(true);
        initialize();
        return;
      }
      if (message.type === "plugin:error") {
        setRuntimeError(typeof message.message === "string" ? message.message : "插件 UI 运行失败。");
        return;
      }
      if (message.type === "host:open-external") {
        const id = message.id;
        const url = message.url;
        if (typeof id !== "string" || !id || id.length > 128) return;
        const reject = (error: string) => post({ type: "host:result", id, error });
        if (typeof url !== "string" || url.length > MAX_EXTERNAL_URL_LENGTH) {
          reject("外部链接无效。");
          return;
        }
        if (externalOpenInFlight.current) {
          reject("已有外部链接正在打开，请稍后重试。");
          return;
        }
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
          externalOpenInFlight.current = true;
          void openUrl(parsed.href)
            .then(() => post({ type: "host:result", id, result: { opened: true } }))
            .catch((error) => reject(error instanceof Error ? error.message : String(error)))
            .finally(() => {
              externalOpenInFlight.current = false;
            });
        } catch {
          reject("只能打开 HTTP 或 HTTPS 链接。");
        }
        return;
      }
      if (message.type !== "tool:execute") return;
      const id = message.id;
      const toolName = message.toolName;
      if (typeof id !== "string" || !id || id.length > 128) return;
      const reject = (error: string) => post({ type: "host:result", id, error });
      if (typeof toolName !== "string" || !toolNames.has(toolName)) {
        reject("插件无权调用该工具。");
        return;
      }
      if (inFlight.current.has(id)) {
        reject("工具调用 ID 重复。");
        return;
      }
      const args = message.args ?? {};
      if (!messageObject(args)) {
        reject("工具参数必须是对象。");
        return;
      }
      let size = 0;
      try {
        size = new TextEncoder().encode(JSON.stringify(args)).byteLength;
      } catch {
        reject("工具参数无法序列化。");
        return;
      }
      if (size > MAX_ARGUMENT_BYTES) {
        reject("工具参数超过 256 KiB 上限。");
        return;
      }
      if (inFlight.current.size >= MAX_CONCURRENT_CALLS) {
        reject("并发工具调用过多，请等待当前调用完成。");
        return;
      }
      inFlight.current.add(id);
      void executeDshPluginUiTool(plugin.id, toolName, args)
        .then((result) => post({ type: "host:result", id, result }))
        .catch((error) => reject(error instanceof Error ? error.message : String(error)))
        .finally(() => inFlight.current.delete(id));
    };
    const themeObserver = new MutationObserver(() => post({ type: "host:theme", theme: theme() }));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("message", onMessage);
    return () => {
      themeObserver.disconnect();
      window.removeEventListener("message", onMessage);
      inFlight.current.clear();
      externalOpenInFlight.current = false;
    };
  }, [plugin.id, plugin.name, plugin.tools, plugin.version, toolNames]);

  useEffect(() => {
    if (!uiDocument || isFrameReady) return;
    const timer = window.setTimeout(() => {
      setRuntimeError("插件界面启动超时，请刷新后重试。");
      setIsFrameReady(true);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [isFrameReady, uiDocument]);

  if (loadError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle />
        <AlertTitle>无法加载插件界面</AlertTitle>
        <AlertDescription className="break-words">{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!uiDocument) {
    return (
      <div className="flex min-h-72 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card/45 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        正在加载沙箱界面
      </div>
    );
  }

  const full = plugin.ui?.kind === "sandbox" && plugin.ui.layout === "full";
  const frame = (
    <div className={full ? "relative h-full min-h-0" : "relative min-h-[520px]"}>
      {!isFrameReady ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          正在启动插件界面
        </div>
      ) : null}
      {navigationBlocked ? (
        <div
          className={
            full
              ? "flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
              : "flex min-h-[520px] items-center justify-center p-8 text-center text-sm text-muted-foreground"
          }
        >
          插件界面已停止，因为它离开了宿主提供的沙箱文档。
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title={`${plugin.name} 插件界面`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={source}
          onLoad={() => {
            frameLoadCount.current += 1;
            if (frameLoadCount.current > 1) {
              setRuntimeError("插件界面尝试离开沙箱文档，已停止显示。");
              setNavigationBlocked(true);
            }
          }}
          className={
            full
              ? "h-full min-h-0 w-full border-0 bg-transparent"
              : "h-[calc(100vh-15rem)] min-h-[520px] w-full border-0 bg-transparent"
          }
        />
      )}
    </div>
  );

  if (full) {
    return (
      <div className="relative h-full min-h-0 overflow-hidden bg-card/30">
        {runtimeError ? (
          <Alert variant="destructive" className="absolute inset-x-4 top-4 z-20 shadow-sm" role="alert">
            <AlertTriangle />
            <AlertDescription className="break-words">{runtimeError}</AlertDescription>
          </Alert>
        ) : null}
        {frame}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{plugin.ui?.title || plugin.name}</span>
        </div>
        <Badge variant="outline">受控沙箱</Badge>
      </div>
      {runtimeError ? (
        <Alert variant="destructive" className="m-4" role="alert">
          <AlertTriangle />
          <AlertDescription className="break-words">{runtimeError}</AlertDescription>
        </Alert>
      ) : null}
      {frame}
    </div>
  );
};
