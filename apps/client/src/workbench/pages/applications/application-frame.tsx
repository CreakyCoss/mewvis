import { applicationChatHost } from "@/workbench/shell/chat-service";
import type { ApplicationChatRequest } from "@isle/app-sdk/chat";
import type { ApplicationDataRequest } from "@isle/app-sdk/data";
import { createBackendApplicationDataTransport } from "@/api/applications/data";
import { platform } from "@/platform";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  executeApplicationUiTool,
  getApplicationUiDocument,
  type ApplicationUiDocument,
  type ApplicationUiApplication,
} from "@/api/applications";
import { Alert, AlertDescription, AlertTitle } from "design-system/components/ui/alert";
import { useWorkspaceHeader } from "@/workbench/shell/layout/workspace";
import { readApplicationTheme, sandboxDocument } from "./sandbox-document";
export { sandboxDocument } from "./sandbox-document";

const CHANNEL = "isle-app-ui-v1";
const MAX_ARGUMENT_BYTES = 256 * 1024;
const MAX_CONCURRENT_CALLS = 4;
const MAX_EXTERNAL_URL_LENGTH = 4_096;

const messageObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const ApplicationFrame = ({
  application,
  chatHost = applicationChatHost,
  loadDocument = getApplicationUiDocument,
}: {
  application: ApplicationUiApplication;
  chatHost?: typeof applicationChatHost;
  loadDocument?: typeof getApplicationUiDocument;
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const registerHeader = useWorkspaceHeader();
  const releaseHeader = useRef<(() => void) | null>(null);
  const inFlight = useRef(new Set<string>());
  const externalOpenInFlight = useRef(false);
  const frameLoadCount = useRef(0);
  const [uiDocument, setUiDocument] = useState<ApplicationUiDocument | null>(null);
  const [chatRuntime, setChatRuntime] = useState<ApplicationUiDocument>();
  const [loadError, setLoadError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const [isFrameReady, setIsFrameReady] = useState(false);
  const embeddedViews = application.permissionStatus === "declared" && application.permissions.includes("embedded-views");
  const source = useMemo(
    () => (uiDocument ? sandboxDocument(uiDocument, chatRuntime, { embeddedViews }) : ""),
    [uiDocument, chatRuntime, embeddedViews],
  );
  const signature = JSON.stringify([
    application.version,
    [...application.permissions].sort(),
    application.agentAccess,
    application.tools.map((tool) => tool.name).sort(),
  ]);
  const toolNames = useMemo(() => new Set(application.tools.map((tool) => tool.name)), [signature]);

  useEffect(() => {
    let cancelled = false;
    releaseHeader.current?.();
    releaseHeader.current = null;
    setUiDocument(null);
    setLoadError("");
    setRuntimeError("");
    setNavigationBlocked(false);
    setIsFrameReady(false);
    frameLoadCount.current = 0;
    void Promise.all([
      loadDocument(application.id),
      application.permissions.includes("chat")
        ? Promise.all([
            import("@/chat/react/dist/application-runtime.js?raw"),
            import("@/chat/react/dist/application-runtime.css?raw"),
          ]).then(([script, style]) => ({ script: script.default, style: style.default }))
        : undefined,
    ])
      .then(([next, runtime]) => {
        if (!cancelled) {
          setUiDocument(next);
          setChatRuntime(runtime);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [application.id, loadDocument, signature]);

  useEffect(() => {
    const post = (message: Record<string, unknown>) =>
      iframeRef.current?.contentWindow?.postMessage({ channel: CHANNEL, ...message }, "*");
    const chat = chatHost.connect(
      application.id,
      application.tools.map((tool) => tool.name),
      (event) => post({ type: "chat:snapshot", event }),
    );
    const chatRequests = new Set<string>();
    const dataRequests = new Set<string>();
    const data = createBackendApplicationDataTransport(application.id);
    let connected = true;
    const initialize = () =>
      post({
        type: "host:init",
        host: {
          application: { id: application.id, name: application.name, version: application.version },
          ...readApplicationTheme(),
          tools: application.tools,
        },
      });
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = messageObject(event.data);
      if (!message || message.channel !== CHANNEL) return;
      if (message.type === "application:ready") {
        setIsFrameReady(true);
        initialize();
        return;
      }
      if (message.type === "application:error") {
        setRuntimeError(typeof message.message === "string" ? message.message : "应用 UI 运行失败。");
        return;
      }
      if (message.type === "header:set") {
        const id = message.id;
        if (typeof id !== "string" || !id || id.length > 128) return;
        if (message.header === null) {
          releaseHeader.current?.();
          releaseHeader.current = null;
          post({ type: "host:result", id, result: { supported: Boolean(registerHeader) } });
          return;
        }
        const header = messageObject(message.header);
        if (
          !header ||
          typeof header.title !== "string" ||
          !header.title.trim() ||
          header.title.length > 160 ||
          (header.backLabel !== undefined &&
            (typeof header.backLabel !== "string" || !header.backLabel.trim() || header.backLabel.length > 80)) ||
          (header.backDisabled !== undefined && typeof header.backDisabled !== "boolean") ||
          Object.keys(header).some((key) => !["title", "backLabel", "backDisabled"].includes(key))
        ) {
          post({ type: "host:result", id, error: "应用顶栏内容无效。" });
          return;
        }
        if (!registerHeader) {
          post({ type: "host:result", id, result: { supported: false } });
          return;
        }
        const title = header.title.trim();
        const backLabel = typeof header.backLabel === "string" ? header.backLabel.trim() : "";
        releaseHeader.current?.();
        releaseHeader.current = registerHeader(
          <header aria-label="应用导航" className="flex h-full min-w-0 items-center justify-end px-3">
            <div className="flex h-8 max-w-full min-w-0 items-center rounded-lg border border-border/70 bg-muted/50 p-0.5 text-xs">
              {backLabel && (
                <>
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-[26px] max-w-36 shrink-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
                    aria-label={`返回${backLabel}`}
                    title={`返回${backLabel}`}
                    disabled={header.backDisabled === true}
                    onClick={() => post({ type: "header:action", action: "back" })}
                  >
                    <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{backLabel}</span>
                  </button>
                  <span className="mx-1 h-3 w-px shrink-0 bg-border" aria-hidden="true" />
                </>
              )}
              <strong className="min-w-0 max-w-60 truncate px-2 font-medium" title={title}>{title}</strong>
            </div>
          </header>,
        );
        post({ type: "host:result", id, result: { supported: true } });
        return;
      }
      if (message.type === "host:clipboard-write") {
        if (typeof message.id !== "string" || !message.id || message.id.length > 128) return;
        if (
          typeof message.text !== "string" ||
          new TextEncoder().encode(message.text).byteLength > MAX_ARGUMENT_BYTES
        ) {
          post({ type: "host:result", id: message.id, error: "复制内容超过 256 KiB 或格式无效" });
          return;
        }
        if (navigator.userActivation && !navigator.userActivation.isActive) {
          post({ type: "host:result", id: message.id, error: "复制需要用户操作" });
          return;
        }
        void navigator.clipboard
          .writeText(message.text)
          .then(() => post({ type: "host:result", id: message.id, result: null }))
          .catch((error) => post({ type: "host:result", id: message.id, error: String(error?.message || error) }));
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
          void platform
            .openExternal(parsed.href)
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
      if (message.type === "chat:request") {
        const id = message.id;
        const request = messageObject(message.request);
        if (typeof id !== "string" || !id || id.length > 128 || !request) return;
        const reject = (error: string) => post({ type: "host:result", id, error });
        if (chatRequests.has(id)) {
          reject("重复的聊天请求 ID");
          return;
        }
        if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_ARGUMENT_BYTES) {
          reject("聊天请求超过 256 KiB");
          return;
        }
        if (chatRequests.size >= 16 && !["stop", "close", "unwatch", "detach"].includes(String(request.method))) {
          reject("聊天请求过多");
          return;
        }
        chatRequests.add(id);
        void chat
          .request(request as ApplicationChatRequest)
          .then(
            (result) => {
              if (connected) post({ type: "host:result", id, result });
            },
            (error) => {
              if (connected) reject(String(error?.message ?? error));
            },
          )
          .finally(() => chatRequests.delete(id));
        return;
      }
      if (message.type === "data:request") {
        const id = message.id;
        const request = messageObject(message.request);
        if (typeof id !== "string" || !id || id.length > 128 || !request) return;
        const reject = (code: string, text: string) =>
          post({ type: "host:result", id, result: { ok: false, error: { code, message: text } } });
        if (dataRequests.has(id) || dataRequests.size >= MAX_CONCURRENT_CALLS) {
          reject("INVALID_ARGUMENT", "应用数据请求重复或并发请求过多");
          return;
        }
        try {
          if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_ARGUMENT_BYTES) {
            reject("INVALID_ARGUMENT", "应用数据请求超过 256 KiB");
            return;
          }
        } catch {
          reject("INVALID_ARGUMENT", "应用数据请求必须是 JSON 数据");
          return;
        }
        dataRequests.add(id);
        void data
          .request(request as ApplicationDataRequest)
          .then((result) => {
            if (connected) post({ type: "host:result", id, result });
          })
          .catch((error) => {
            if (connected) post({ type: "host:result", id, error: String(error?.message ?? error) });
          })
          .finally(() => dataRequests.delete(id));
        return;
      }
      if (message.type !== "tool:execute") return;
      const id = message.id;
      const toolName = message.toolName;
      if (typeof id !== "string" || !id || id.length > 128) return;
      const reject = (error: string) => post({ type: "host:result", id, error });
      if (typeof toolName !== "string" || !toolNames.has(toolName)) {
        reject("应用无权调用该工具。");
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
      void executeApplicationUiTool(application.id, toolName, args)
        .then((result) => post({ type: "host:result", id, result }))
        .catch((error) => reject(error instanceof Error ? error.message : String(error)))
        .finally(() => inFlight.current.delete(id));
    };
    const themeObserver = new MutationObserver(() => post({ type: "host:theme", ...readApplicationTheme() }));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    window.addEventListener("message", onMessage);
    return () => {
      connected = false;
      data.dispose();
      chat.dispose();
      themeObserver.disconnect();
      window.removeEventListener("message", onMessage);
      releaseHeader.current?.();
      releaseHeader.current = null;
      inFlight.current.clear();
      externalOpenInFlight.current = false;
    };
  }, [application.id, signature, toolNames, chatHost, registerHeader]);

  useEffect(() => {
    if (!navigationBlocked) return;
    releaseHeader.current?.();
    releaseHeader.current = null;
  }, [navigationBlocked]);

  useEffect(() => {
    if (!uiDocument || isFrameReady) return;
    const timer = window.setTimeout(() => {
      setRuntimeError("应用界面启动超时，请刷新后重试。");
      setIsFrameReady(true);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [isFrameReady, uiDocument]);

  if (loadError) {
    return (
      <Alert variant="destructive" className="m-4 w-auto" role="alert">
        <AlertTriangle />
        <AlertTitle>无法加载应用界面</AlertTitle>
        <AlertDescription className="break-words">{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!uiDocument) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-card/45 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        正在加载沙箱界面
      </div>
    );
  }

  const frame = (
    <div className="relative h-full min-h-0">
      {!isFrameReady ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          正在启动应用界面
        </div>
      ) : null}
      {navigationBlocked ? (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
          应用界面已停止，因为它离开了宿主提供的沙箱文档。
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title={`${application.name} 应用界面`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={source}
          onLoad={() => {
            frameLoadCount.current += 1;
            if (frameLoadCount.current > 1) {
              setRuntimeError("应用界面尝试离开沙箱文档，已停止显示。");
              setNavigationBlocked(true);
            }
          }}
          className="h-full min-h-0 w-full border-0 bg-transparent"
        />
      )}
    </div>
  );

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
};
