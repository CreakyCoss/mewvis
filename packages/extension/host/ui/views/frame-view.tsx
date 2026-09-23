import { useEffect, useRef, useState } from "react";
import { useViewTransport } from "./transport-context";
import type { JsonObject } from "../../shared.js";
import { useDialogRuntime } from "../runtime/dialog-context";
import { extensionFrameDocument } from "./frame-document";

export function ExtensionView({
  extensionId,
  contributionId,
  viewId,
  revision,
  title,
  workspacePath,
  chatId,
  input,
  dialogId,
}: {
  extensionId: string;
  contributionId: string;
  viewId: string;
  revision: string;
  title: string;
  workspacePath: string;
  chatId: string;
  input?: JsonObject;
  dialogId?: number;
}) {
  const transport = useViewTransport();
  const dialogs = useDialogRuntime();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let closed = false,
      token: string | undefined,
      frame: HTMLIFrameElement | undefined;
    let channel: MessageChannel | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const owner = {
      key: Symbol(),
      extensionId,
      revision,
      context: { workspacePath, chatId },
    };
    let disconnectUI: (() => void) | undefined;
    let themeObserver: MutationObserver | undefined;
    setError("");
    setLoading(true);
    const release = () => {
      disconnectUI?.();
      themeObserver?.disconnect();
      dialogs.release(owner.key);
      clearTimeout(timer);
      channel?.port1.postMessage({ type: "dispose" });
      channel?.port1.close();
      channel?.port2.close();
      frame?.remove();
      channel = undefined;
      frame = undefined;
      if (token) {
        void transport.close(token).catch(() => {});
        token = undefined;
      }
    };
    const fail = (message: string) => {
      if (!closed) {
        setLoading(false);
        setError(message);
        closed = true;
        release();
      }
    };
    void transport
      .open({ id: extensionId, contributionId, viewId, workspacePath, chatId })
      .then((view) => {
        if (closed) {
          void transport.close(view.token).catch(() => {});
          return;
        }
        token = view.token;
        frame = document.createElement("iframe");
        frame.title = title;
        frame.setAttribute("sandbox", "allow-scripts");
        frame.referrerPolicy = "no-referrer";
        frame.className = "h-full min-h-0 w-full flex-1 border-0";
        frame.srcdoc = extensionFrameDocument(crypto.randomUUID());
        channel = new MessageChannel();
        const port = channel.port1;
        let busy = false;
        port.onmessage = async ({ data }: MessageEvent<unknown>) => {
          if (closed || !data || typeof data !== "object") return;
          const message = data as Record<string, unknown>;
          if (message.type === "ready") {
            clearTimeout(timer);
            setLoading(false);
          }
          if (message.type === "error") {
            clearTimeout(timer);
            fail(String(message.message));
          }
          if (message.type === "dialog.close") {
            if (dialogId !== undefined) dialogs.close(dialogId);
            return;
          }
          if (message.type === "cancel" && Number.isSafeInteger(message.id)) {
            void transport
              .cancel(view.token, message.id as number)
              .catch(() => {});
            return;
          }
          if (message.type !== "request" || !Number.isSafeInteger(message.id))
            return;
          const id = message.id as number;
          if (typeof message.method !== "string" || busy) {
            port.postMessage({
              type: "response",
              id,
              error: {
                code: "HOST_UNAVAILABLE",
                message: "接口不可用或请求进行中",
              },
            });
            return;
          }
          busy = true;
          try {
            const value =
              message.method === "ui.dialog.open"
                ? await dialogs.open(owner, message.arguments)
                : await transport.query(
                    view.token,
                    message.method,
                    message.arguments,
                    id,
                  );
            if (!closed) port.postMessage({ type: "response", id, value });
          } catch (error) {
            if (!closed)
              port.postMessage({
                type: "response",
                id,
                error: {
                  code:
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    /^(HOST_|UI_)/.test(String(error.code))
                      ? error.code
                      : "HOST_UNAVAILABLE",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              });
          } finally {
            busy = false;
          }
        };
        port.start();
        frame.onload = () => {
          if (closed || !frame || !channel) return;
          const readTheme = () => {
            const styles = getComputedStyle(document.documentElement);
            return Object.fromEntries(
              [
                "background",
                "foreground",
                "muted",
                "muted-foreground",
                "border",
                "primary",
                "primary-foreground",
                "surface",
                "surface-raised",
                "success",
                "destructive",
                "ring",
                "popover",
                "popover-foreground",
              ].map((name) => [
                `--${name}`,
                styles.getPropertyValue(`--${name}`),
              ]),
            );
          };
          const theme = readTheme();
          disconnectUI = dialogs.subscribe(() =>
            port.postMessage({ type: "ui.support", dialog: dialogs.available }),
          );
          themeObserver = new MutationObserver(() =>
            port.postMessage({ type: "theme", theme: readTheme() }),
          );
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
          });
          frame.contentWindow?.postMessage(
            {
              type: "isle.extension.connect",
              source: view.source,
              id: view.id,
              contributionId: view.contributionId,
              viewId: view.viewId,
              config: view.config,
              input: input ?? {},
              dialog: dialogs.available,
              isDialog: dialogId !== undefined,
              capabilities: view.capabilities,
              theme,
            },
            "*",
            [channel.port2],
          );
          frame.onload = null;
        };
        timer = setTimeout(() => fail("插件界面加载超时，请重试"), 15000);
        container.current?.append(frame);
      })
      .catch((error) =>
        fail(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      closed = true;
      release();
    };
  }, [
    extensionId,
    contributionId,
    viewId,
    title,
    revision,
    workspacePath,
    chatId,
    attempt,
    transport,
    dialogs,
    input,
    dialogId,
  ]);
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={title}>
      {loading ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          正在加载…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="p-4 text-sm">
          <p>{error}</p>
          <button
            type="button"
            className="mt-3 text-primary underline"
            onClick={() => retry((value) => value + 1)}
          >
            重新加载
          </button>
        </div>
      ) : null}
      <div
        ref={container}
        className={`min-h-0 flex-1 ${error ? "hidden" : "flex"}`}
      />
    </section>
  );
}
