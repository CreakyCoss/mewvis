import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Folder,
  FolderPlus,
  Hash,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  getApplicationChatClient,
  type ApplicationChatSummary,
} from "@mewvis/app-sdk/chat";
import type { ApplicationWorkspace } from "@mewvis/app-sdk/data";
import { LabDialog } from "./LabDialog";
import "./session-manager.css";

type Props = {
  open: boolean;
  workspaces: ApplicationWorkspace[];
  activeWorkspaceId: string;
  activeChatId?: string;
  busy: boolean;
  creatingWorkspace: boolean;
  error: string;
  onClose(): void;
  onClearError(): void;
  onRefresh(): Promise<void>;
  onCreate(workspaceId: string): Promise<void>;
  onConnect(chatId: string, workspaceId: string): Promise<void>;
  onAddWorkspace(name: string): Promise<ApplicationWorkspace | null>;
};

function updatedLabel(value: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : date.toLocaleDateString("zh-CN", {
        ...(date.getFullYear() !== today.getFullYear()
          ? { year: "numeric" as const }
          : {}),
        month: "short",
        day: "numeric",
      });
}

export function SessionManager({
  open,
  workspaces,
  activeWorkspaceId,
  activeChatId,
  busy,
  creatingWorkspace,
  error,
  onClose,
  onClearError,
  onRefresh,
  onCreate,
  onConnect,
  onAddWorkspace,
}: Props) {
  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"sessions" | "workspace" | "connect">(
    "sessions",
  );
  const [workspaceName, setWorkspaceName] = useState("");
  const [chatId, setChatId] = useState("");
  const [revision, setRevision] = useState(0);
  const [openingId, setOpeningId] = useState("");
  const [history, setHistory] = useState<{
    workspaceId: string;
    items: ApplicationChatSummary[];
    loading: boolean;
    error: string;
  }>({ workspaceId: "", items: [], loading: false, error: "" });

  useEffect(() => {
    if (!open) return;
    setWorkspaceId(activeWorkspaceId);
    setQuery("");
    setStep("sessions");
    setChatId("");
    setWorkspaceName("");
  }, [open, activeWorkspaceId]);
  useEffect(() => {
    if (open && !workspaces.some((item) => item.id === workspaceId))
      setWorkspaceId(workspaces[0]?.id ?? "");
  }, [open, workspaceId, workspaces]);
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setHistory({ workspaceId, items: [], loading: true, error: "" });
    void getApplicationChatClient()
      .listSessions({ workspaceId })
      .then((items) => {
        if (!cancelled)
          setHistory({
            workspaceId,
            items: [...items].sort((a, b) => b.updatedAt - a.updatedAt),
            loading: false,
            error: "",
          });
      })
      .catch((cause) => {
        if (!cancelled)
          setHistory({
            workspaceId,
            items: [],
            loading: false,
            error: cause instanceof Error ? cause.message : String(cause),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, revision]);

  const workspace = workspaces.find((item) => item.id === workspaceId);
  const loading =
    !!workspace && (history.workspaceId !== workspaceId || history.loading);
  const items = history.workspaceId === workspaceId ? history.items : [];
  const matches = items.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const browse = (id: string) => {
    onClearError();
    setWorkspaceId(id);
    setQuery("");
    setStep("sessions");
  };
  const changeStep = (next: typeof step) => {
    onClearError();
    setStep(next);
  };
  const connect = async (id: string) => {
    if (busy || openingId || !id.trim()) return;
    setOpeningId(id);
    try {
      await onConnect(id.trim(), workspaceId);
    } finally {
      setOpeningId("");
    }
  };
  const addWorkspace = async () => {
    if (busy || !workspaceName.trim()) return;
    const created = await onAddWorkspace(workspaceName.trim());
    if (created) {
      browse(created.id);
      setWorkspaceName("");
    }
  };

  return (
    <LabDialog
      open={open}
      title="会话与工作区"
      className="lab-session-manager"
      onClose={onClose}
    >
      <div className="manager-layout">
        <aside className="manager-sidebar" aria-label="工作区列表">
          <div className="manager-sidebar-heading">
            <span>工作区</span>
            <button
              type="button"
              className="lab-icon-button"
              aria-label="刷新工作区与会话"
              title="刷新工作区与会话"
              disabled={busy || loading}
              onClick={async () => {
                await onRefresh();
                setRevision((value) => value + 1);
              }}
            >
              <RefreshCw
                aria-hidden="true"
                className={busy || loading ? "is-spinning" : ""}
              />
            </button>
          </div>
          <div className="manager-workspaces">
            {workspaces.map((item) => (
              <button
                type="button"
                key={item.id}
                className="manager-workspace"
                aria-pressed={workspaceId === item.id && step !== "workspace"}
                disabled={busy}
                onClick={() => browse(item.id)}
                title={`${item.name}\n${item.path}`}
              >
                <Folder aria-hidden="true" />
                <span>{item.name}</span>
                {item.isDefault && <small>默认</small>}
              </button>
            ))}
            {!workspaces.length && (
              <p className="manager-sidebar-empty">
                {busy ? "加载工作区…" : "还没有工作区"}
              </p>
            )}
          </div>
          <button
            type="button"
            className="manager-add-workspace"
            aria-pressed={step === "workspace"}
            disabled={busy}
            onClick={() => changeStep("workspace")}
          >
            <Plus aria-hidden="true" />
            新增工作区
          </button>
        </aside>

        <section className="manager-main" aria-label="工作区内容">
          {step === "sessions" ? (
            <>
              <div className="manager-main-heading">
                <div className="manager-workspace-info">
                  <h3>{workspace?.name ?? "选择工作区"}</h3>
                  <p title={workspace?.path}>
                    {workspace?.path ?? "选择一个工作区，查看其中的对话。"}
                  </p>
                </div>
                <button
                  type="button"
                  className="lab-button lab-primary"
                  disabled={busy || !workspace}
                  onClick={() => void onCreate(workspaceId)}
                >
                  <Plus aria-hidden="true" />
                  新对话
                </button>
              </div>
              <div className="manager-search">
                <Search aria-hidden="true" />
                <input
                  aria-label="搜索当前工作区的对话"
                  placeholder="搜索对话…"
                  value={query}
                  disabled={!workspace || busy}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="lab-icon-button"
                    aria-label="清空搜索"
                    onClick={() => setQuery("")}
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="manager-list-heading">
                <span>{query.trim() ? "搜索结果" : "最近对话"}</span>
                <span role="status">
                  {loading ? "加载中…" : `${matches.length} 个会话`}
                </span>
              </div>
              <div
                className="manager-conversations"
                aria-label="历史对话"
                aria-busy={loading}
              >
                {loading ? (
                  <div className="manager-empty" role="status">
                    <RefreshCw aria-hidden="true" className="is-spinning" />
                    <p>正在加载对话…</p>
                  </div>
                ) : history.error && history.workspaceId === workspaceId ? (
                  <div className="manager-empty" role="alert">
                    <p>暂时无法加载对话</p>
                    <span>{history.error}</span>
                    <button
                      type="button"
                      className="lab-button"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      重新加载
                    </button>
                  </div>
                ) : matches.length ? (
                  matches.map((item) => {
                    const current =
                      activeWorkspaceId === workspaceId &&
                      activeChatId === item.chatId;
                    return (
                      <button
                        type="button"
                        key={item.chatId}
                        className="manager-conversation"
                        aria-current={current ? "true" : undefined}
                        disabled={busy || !!openingId}
                        onClick={() => void connect(item.chatId)}
                      >
                        <MessageCircle
                          aria-hidden="true"
                          className="manager-conversation-icon"
                        />
                        <span className="manager-conversation-copy">
                          <strong>{item.title || "未命名对话"}</strong>
                          <span>
                            <time
                              dateTime={new Date(item.updatedAt).toISOString()}
                            >
                              {updatedLabel(item.updatedAt)}
                            </time>
                            <span>·</span>
                            <span>{item.messageCount} 条消息</span>
                          </span>
                        </span>
                        {openingId === item.chatId ? (
                          <RefreshCw
                            className="is-spinning"
                            aria-label="连接中"
                          />
                        ) : current ? (
                          <span className="manager-current">
                            <Check aria-hidden="true" />
                            当前
                          </span>
                        ) : (
                          <ArrowRight
                            aria-hidden="true"
                            className="manager-open-arrow"
                          />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="manager-empty">
                    {query.trim() ? (
                      <Search aria-hidden="true" />
                    ) : (
                      <MessageCircle aria-hidden="true" />
                    )}
                    <h4>
                      {query.trim() ? "没有找到相关对话" : "这里还没有对话"}
                    </h4>
                    <p>
                      {query.trim()
                        ? "试试其他关键词，或清空搜索。"
                        : "新建一段对话，发送消息后会自动保存在这里。"}
                    </p>
                    {query.trim() && (
                      <button
                        type="button"
                        className="lab-button lab-quiet"
                        onClick={() => setQuery("")}
                      >
                        清空搜索
                      </button>
                    )}
                  </div>
                )}
              </div>
              <footer className="manager-footer">
                <span>选择会话即可打开</span>
                <button
                  type="button"
                  className="lab-button lab-quiet"
                  disabled={busy || !workspace}
                  onClick={() => changeStep("connect")}
                >
                  <Hash aria-hidden="true" />
                  通过 ID 连接
                </button>
              </footer>
            </>
          ) : (
            <div className="manager-step">
              <button
                type="button"
                className="lab-button lab-quiet manager-back"
                disabled={busy}
                onClick={() => changeStep("sessions")}
              >
                <ArrowLeft aria-hidden="true" />
                返回会话列表
              </button>
              <div className="manager-step-heading">
                {step === "workspace" ? (
                  <FolderPlus aria-hidden="true" />
                ) : (
                  <Hash aria-hidden="true" />
                )}
                <h3>{step === "workspace" ? "新增工作区" : "连接已有会话"}</h3>
                <p>
                  {step === "workspace"
                    ? "为这组对话命名，再选择保存对话的本地目录。"
                    : `连接「${workspace?.name ?? "当前工作区"}」中的会话。`}
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (step === "workspace") void addWorkspace();
                  else void connect(chatId);
                }}
              >
                <label
                  htmlFor={
                    step === "workspace"
                      ? "manager-workspace-name"
                      : "manager-chat-id"
                  }
                >
                  {step === "workspace" ? "工作区名称" : "会话 ID"}
                </label>
                {step === "workspace" ? (
                  <input
                    key="name"
                    id="manager-workspace-name"
                    autoFocus
                    required
                    maxLength={512}
                    value={workspaceName}
                    disabled={busy}
                    placeholder="例如：产品设计"
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                ) : (
                  <input
                    key="id"
                    id="manager-chat-id"
                    autoFocus
                    required
                    maxLength={128}
                    value={chatId}
                    disabled={busy}
                    placeholder="粘贴已有会话 ID"
                    onChange={(event) => setChatId(event.target.value)}
                  />
                )}
                <p className="manager-form-help">
                  {step === "workspace"
                    ? "下一步选择目录；取消选择不会创建工作区。"
                    : "会话必须属于当前工作区和本应用。"}
                </p>
                <div className="manager-form-actions">
                  <button
                    type="button"
                    className="lab-button"
                    disabled={busy}
                    onClick={() => changeStep("sessions")}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="lab-button lab-primary"
                    disabled={
                      busy ||
                      !(step === "workspace"
                        ? workspaceName.trim()
                        : chatId.trim())
                    }
                  >
                    {step === "workspace"
                      ? creatingWorkspace
                        ? "等待选择目录…"
                        : "选择目录并创建"
                      : openingId
                        ? "连接中…"
                        : "连接会话"}
                  </button>
                </div>
              </form>
            </div>
          )}
          {error && (
            <p className="manager-action-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </LabDialog>
  );
}
