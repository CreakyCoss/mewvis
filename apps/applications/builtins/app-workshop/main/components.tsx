import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  FileCode2,
  LoaderCircle,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import {
  getApplicationHost,
  type ApplicationHeaderHost,
} from "@isle/app-sdk/browser";
import {
  mountApplicationView,
  type ApplicationViewValue,
} from "@isle/app-sdk/views";
import type { BuildArtifact, ProjectSummary } from "./contracts";
import { errorText } from "./api";
import { previewInteractionGuard } from "./preview";
import { useToastLayer } from "./Notifications";

export function ApplicationHeader({
  name = "小应用",
  home,
  disabled = false,
}: {
  name?: string;
  home(): void;
  disabled?: boolean;
}) {
  const [header] = useState<ApplicationHeaderHost | undefined>(() => {
    try {
      return getApplicationHost().header;
    } catch {
      return undefined;
    }
  });
  const [hosted, setHosted] = useState(false);
  const homeAction = useRef(home);
  const disabledRef = useRef(disabled);
  homeAction.current = home;
  disabledRef.current = disabled;
  useEffect(() => {
    if (!header) return;
    const unsubscribe = header.subscribe((action) => {
      if (action === "back" && !disabledRef.current) homeAction.current();
    });
    return () => {
      unsubscribe();
      void header.set(null).catch(() => {});
    };
  }, [header]);
  useEffect(() => {
    if (!header) return;
    let active = true;
    void header
      .set({ title: name, backLabel: "应用工坊", backDisabled: disabled })
      .then((result) => {
        if (active) setHosted(result.supported);
      })
      .catch(() => {
        if (active) setHosted(false);
      });
    return () => {
      active = false;
    };
  }, [header, name, disabled]);
  if (hosted) return null;
  return (
    <header className="wk-header wk-application-header" aria-label="应用导航">
      <div className="wk-application-navigation">
        <button
          type="button"
          className="wk-back"
          onClick={home}
          disabled={disabled}
          aria-label="返回应用工坊"
          title="返回应用工坊"
        >
          <ArrowLeft aria-hidden="true" />
          <span>应用工坊</span>
        </button>
        <span className="wk-header-divider" aria-hidden="true" />
        <strong className="wk-header-name" title={name}>
          {name}
        </strong>
      </div>
    </header>
  );
}

export function Status({ project }: { project: ProjectSummary }) {
  return (
    <span
      className={`wk-status ${project.error ? "is-error" : project.savedVersionId ? "is-ready" : ""}`}
    >
      {project.error ? (
        <AlertCircle />
      ) : project.savedVersionId ? (
        <CheckCircle2 />
      ) : (
        <Clock3 />
      )}
      {project.error ? "不可用" : project.savedVersionId ? "可使用" : "待生成"}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="wk-empty">
      {icon ?? <Code2 className="wk-empty-icon" />}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="wk-error" role="alert">
      <AlertCircle />
      <span>{children}</span>
    </div>
  );
}
export function Busy({ text = "正在加载…" }: { text?: string }) {
  return (
    <div className="wk-loading" role="status">
      <LoaderCircle className="wk-spin" />
      {text}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const registerToastLayer = useToastLayer();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const unregisterToastLayer = registerToastLayer(dialog);
    dialog.querySelector<HTMLElement>("[autofocus], input, textarea")?.focus();
    return () => {
      unregisterToastLayer();
      dialog.close();
    };
  }, [registerToastLayer]);
  return (
    <dialog
      ref={ref}
      className={`wk-modal ${className}`}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="wk-modal-content">
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="wk-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function AppView({
  artifact,
  projectId,
  scope = "preview",
  passive = false,
  onFailure,
}: {
  artifact: BuildArtifact | null;
  projectId: string;
  scope?: "preview" | "live";
  passive?: boolean;
  onFailure?(message: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(!!artifact);
  useEffect(() => {
    setError("");
    setLoading(!!artifact);
    if (!artifact || !ref.current) return;
    const storage = getApplicationDataClient().storage;
    const viewId = `${projectId}-${scope}`;
    const key = (params: Readonly<Record<string, ApplicationViewValue>>) => {
      if (
        typeof params.key !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(params.key)
      )
        throw new Error("状态键须为 1–64 个字母、数字、下划线或连字符。");
      return `mini:${projectId}:${scope}:${params.key}`;
    };
    let active = true;
    try {
      const view = mountApplicationView(ref.current, {
        id: viewId,
        title: passive ? "小应用界面预览（可滚动）" : "小应用运行界面",
        script: passive
          ? previewInteractionGuard + artifact.script
          : artifact.script,
        style: artifact.style,
        methods: {
          "state.read": async (params, { viewId: actual, signal }) => {
            if (
              actual !== viewId ||
              Object.keys(params).some((field) => field !== "key")
            )
              throw new Error("状态读取参数无效。");
            signal.throwIfAborted();
            return storage.getItem(key(params));
          },
          "state.write": async (params, { viewId: actual, signal }) => {
            if (
              actual !== viewId ||
              !Object.hasOwn(params, "value") ||
              Object.keys(params).some(
                (field) => field !== "key" && field !== "value",
              )
            )
              throw new Error("状态写入参数无效。");
            signal.throwIfAborted();
            const stateKey = key(params);
            if (!passive) await storage.setItem(stateKey, params.value);
            return null;
          },
        },
        onError: (value) => {
          if (active) {
            setError(value.message);
            setLoading(false);
            onFailure?.(value.message);
          }
        },
      });
      void view.ready
        .then(() => {
          if (active) setLoading(false);
        })
        .catch((value) => {
          if (active) {
            const message = errorText(value);
            setError(message);
            setLoading(false);
            onFailure?.(message);
          }
        });
      return () => {
        active = false;
        view.dispose();
      };
    } catch (value) {
      const message = errorText(value);
      setError(message);
      setLoading(false);
      onFailure?.(message);
    }
    return () => {
      active = false;
    };
  }, [
    artifact?.id,
    artifact?.sourceHash,
    artifact?.createdAt,
    projectId,
    scope,
    passive,
    retry,
  ]);
  return (
    <div className={`wk-view ${passive ? "is-passive" : ""}`}>
      <div ref={ref} className="wk-view-frame" />
      {loading && (
        <div className="wk-view-overlay">
          <Busy text="正在启动小应用…" />
        </div>
      )}
      {error && (
        <div className="wk-view-overlay">
          <ErrorNotice>{error}</ErrorNotice>
          <button
            className="wk-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            重新运行
          </button>
        </div>
      )}
    </div>
  );
}
export function FileIcon() {
  return <FileCode2 aria-hidden="true" />;
}
export function ProjectIcon({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const kind = /计时|专注|clock|timer/i.test(name)
    ? "timer"
    : /便签|灵感|笔记|note/i.test(name)
      ? "notes"
      : /阅读|读书|书籍|book/i.test(name)
        ? "book"
        : /记账|收支|账单|budget/i.test(name)
          ? "wallet"
          : "code";
  const Icon = {
    timer: Clock3,
    notes: StickyNote,
    book: BookOpen,
    wallet: Wallet,
    code: Code2,
  }[kind];
  return (
    <span className={`wk-app-icon ${large ? "is-large" : ""}`} data-kind={kind}>
      <Icon aria-hidden="true" />
    </span>
  );
}
