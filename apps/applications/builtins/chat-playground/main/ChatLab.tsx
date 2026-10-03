import { APP_DISPLAY_NAME } from "@mewvis/product-config";
import "./chat.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getApplicationChatClient,
  type ChatMessage,
  type ChatPhase,
  type ApplicationChatOpenInput,
  type ApplicationChatSummary,
  type ApplicationChatSession,
  type OperationResult,
  type ChatPermissionMode,
} from "@mewvis/app-sdk/chat";
import {
  Chat,
  useChatComposer,
  useChatSnapshot,
  useApplicationChatSession,
} from "@mewvis/app-sdk/chat/react";
import {
  getApplicationDataClient,
  type ApplicationWorkspace,
} from "@mewvis/app-sdk/data";
import { createPlaygroundPreferences } from "./preferences";
import {
  Code2,
  History,
  MessageCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { CodeExample } from "./components/Example";
import { LabDialog } from "./components/LabDialog";
import { SessionManager } from "./components/SessionManager";

export type ChatPreset = {
  label: string;
  text: string;
  permissionMode?: ChatPermissionMode;
};

const profile = {
  id: "chat-playground-v1",
  systemPrompt: `你是 ${APP_DISPLAY_NAME} 聊天调试助手，用中文简洁回答。按用户要求演示 Markdown、代码和应用工具。需要验证工具时，使用用户指定的工具；未指定时调用 chat_playground_echo。不要虚构工具执行或宿主状态。`,
  useKnowledge: true,
};
const phases: Record<ChatPhase, string> = {
  initializing: "初始化",
  idle: "就绪",
  preparing: "准备中",
  submitting: "提交中",
  running: "生成中",
  waiting: "等待回答",
  stopping: "停止中",
  pausing: "暂停中",
  paused: "已暂停",
  closing: "关闭中",
  closed: "已关闭",
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const prompts = [
  {
    label: "Markdown",
    text: "请用 Markdown 演示一个三级标题、三项列表、一个两列表格和一段 TypeScript 代码。",
  },
  {
    label: "低风险工具",
    text: `请调用 chat_playground_echo，text 设为“Hello ${APP_DISPLAY_NAME} 👋”，然后说明返回的文本和字符数。`,
  },
  {
    label: "中风险工具",
    text: "请调用 chat_playground_medium_risk，text 设为“中风险审批测试”，然后说明实际返回的文本和字符数。",
  },
  {
    label: "技能示例",
    text: `请使用 chat-playground-text-inspection 技能，分析文本“Hello ${APP_DISPLAY_NAME} 👋”的字符数、UTF-8 字节数和 SHA-256，并解释字符数与字节数为什么不同。`,
  },
  {
    label: "长回复 / 停止",
    text: "请分十个小节详细介绍如何设计一个聊天应用，每节写一段，方便我测试流式输出和停止。",
  },
];
function QuickPrompts({
  preset,
  session,
  open,
  onClose,
  onApplied,
}: {
  preset?: ChatPreset;
  session: ApplicationChatSession;
  open: boolean;
  onClose(): void;
  onApplied(): void;
}) {
  const binding = useChatComposer();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const apply = async (example: ChatPreset) => {
    if (pending || binding.disabled) return;
    setPending(true);
    setError("");
    try {
      if (example.permissionMode) {
        const result = await session.updateConfig({
          permissionMode: example.permissionMode,
        });
        if (!result.ok) throw new Error(result.error);
      }
      binding.setDraft({
        text: example.text,
        blocks: [{ type: "text", content: example.text }],
      });
      onApplied();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <LabDialog open={open} title="体验示例" onClose={onClose}>
      <p className="lab-panel-intro">选择一个示例填入输入框，确认后发送。</p>
      {preset && (
        <section className="lab-selected-example">
          <span>当前选择</span>
          <h3>{preset.label}</h3>
          <p>{preset.text}</p>
          {preset.permissionMode && (
            <p className="lab-help">
              填入时将切换到 {preset.permissionMode} 权限档位。
            </p>
          )}
          <button
            type="button"
            className="lab-button lab-primary"
            disabled={binding.disabled || pending}
            onClick={() => void apply(preset)}
          >
            {pending ? "准备中…" : "填入此示例"}
          </button>
        </section>
      )}
      <div className="lab-example-list">
        {prompts.map((example) => (
          <button
            type="button"
            key={example.label}
            disabled={binding.disabled || pending}
            onClick={() => void apply(example)}
          >
            <strong>{example.label}</strong>
            <span>{example.text}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
    </LabDialog>
  );
}
function renderMessage(message: ChatMessage, content: ReactNode) {
  return (
    <div
      className={`lab-message lab-message-${message.role}`}
      data-message-kind={message.role}
    >
      {content}
    </div>
  );
}
function Inspector({ session }: { session: ApplicationChatSession }) {
  const state = useChatSnapshot();
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const run = async (
    label: string,
    action: () => Promise<OperationResult | void>,
  ) => {
    setPending(label);
    setNotice("");
    setError("");
    try {
      const result = await action();
      if (result && !result.ok) throw new Error(result.error);
      setNotice(`${label}完成`);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending("");
    }
  };
  const tools = state.messages.reduce(
    (count, message) =>
      count + message.blocks.filter((block) => block.type === "tool").length,
    0,
  );
  return (
    <aside className="lab-inspector" aria-label="会话检查器">
      <div className="lab-section-heading">
        <h3>会话状态</h3>
        <span className="lab-badge">实时</span>
      </div>
      <dl className="lab-metrics">
        <div>
          <dt>消息</dt>
          <dd>{state.messages.length}</dd>
        </div>
        <div>
          <dt>工具调用</dt>
          <dd>{tools}</dd>
        </div>
        <div>
          <dt>保存</dt>
          <dd>
            {state.saveError ? "失败" : state.dirty ? "待保存" : "已同步"}
          </dd>
        </div>
      </dl>
      <dl className="lab-facts">
        <dt>会话 ID</dt>
        <dd>
          <code>{session.identity.id}</code>
        </dd>
        <dt>任务 ID</dt>
        <dd>{state.activeTaskId ?? "暂无任务"}</dd>
        <dt>模型</dt>
        <dd>
          {state.resources.models?.find(
            (model) => model.value === state.config.selectedModelId,
          )?.label ||
            state.config.selectedModelId ||
            "未选择"}
        </dd>
        <dt>已选能力</dt>
        <dd>
          技能 {state.config.selectedSkillKeys.length} · 可用工具{" "}
          {state.resources.tools?.length ?? 0} · 知识库{" "}
          {state.config.selectedKnowledgeCollectionIds.length}
        </dd>
      </dl>
      <div className="lab-utilities">
        <button
          type="button"
          disabled={!!pending || state.phase === "closed"}
          onClick={() => void run("重新同步", () => session.reconnect())}
        >
          重新同步
        </button>
        <button
          type="button"
          disabled={!!pending || state.phase !== "idle"}
          onClick={() => void run("刷新资源", () => session.refreshResources())}
        >
          刷新资源
        </button>
        <button
          type="button"
          disabled={!!pending || state.phase === "closed"}
          onClick={() => void run("保存", () => session.retrySave())}
        >
          立即保存
        </button>
        <button
          type="button"
          disabled={!!pending || state.phase === "closed"}
          onClick={() => void run("关闭会话", () => session.close())}
        >
          关闭会话
        </button>
      </div>
      <p className="lab-help">关闭会话会停止任务并保存，可从对话页重新连接。</p>
      <details className="lab-disclosure">
        <summary>业务上下文</summary>
        <label className="lab-context-label" htmlFor="lab-context">
          本轮业务上下文
        </label>
        <textarea
          id="lab-context"
          value={context}
          maxLength={16000}
          rows={4}
          placeholder="例如：本轮请使用表格回答。"
          disabled={state.phase !== "idle" || !!pending}
          onChange={(event) => setContext(event.target.value)}
        />
        <button
          className="lab-context-apply"
          type="button"
          disabled={state.phase !== "idle" || !!pending}
          onClick={() =>
            void run("应用上下文", () =>
              session.setContext({ requestContext: context }),
            )
          }
        >
          应用到后续请求
        </button>
        <p className="lab-help">
          上下文在宿主会话内生效；此输入不随应用页面重载恢复。
        </p>
      </details>
      {pending && <p role="status">正在{pending}…</p>}
      {notice && (
        <p className="lab-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      <details className="lab-snapshot">
        <summary>查看运行快照</summary>
        <pre>
          {JSON.stringify(
            {
              identity: state.identity,
              phase: state.phase,
              config: state.config,
              activeTaskId: state.activeTaskId,
              pendingQuestion: state.pendingQuestion,
              dirty: state.dirty,
              error: state.error,
              saveError: state.saveError,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </aside>
  );
}
function Workbench({
  session,
  preset,
  showPreset,
  onPresetShown,
  reconnect,
}: {
  session: ApplicationChatSession;
  preset?: ChatPreset;
  showPreset: boolean;
  onPresetShown(): void;
  reconnect(): void;
}) {
  const state = useChatSnapshot();
  const [mode, setMode] = useState<"custom" | "default">("custom");
  const [visible, setVisible] = useState(true);
  const [compare, setCompare] = useState(false);
  const [comparePane, setComparePane] = useState<"primary" | "secondary">(
    "primary",
  );
  const [inspect, setInspect] = useState(false);
  const [examples, setExamples] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (preset && showPreset) {
      setVisible(true);
      setComparePane("primary");
      setExamples(true);
      onPresetShown();
    }
  }, [preset, showPreset, onPresetShown]);
  return (
    <>
      <div className="lab-session-bar">
        <span className="lab-status" data-phase={state.phase}>
          <i aria-hidden="true" />
          {phases[state.phase]}
        </span>
        <span className="lab-mode-note">
          {compare ? "双视图" : mode === "custom" ? "定制界面" : "默认界面"}
        </span>
        <div className="lab-view-actions">
          <button
            type="button"
            className="lab-button lab-quiet"
            onClick={() => setExamples(true)}
            aria-haspopup="dialog"
          >
            <Sparkles aria-hidden="true" />
            体验示例
          </button>
          <button
            type="button"
            className="lab-button lab-quiet"
            onClick={() => setInspect(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal aria-hidden="true" />
            调试与设置
          </button>
        </div>
      </div>
      {state.pendingApproval && (
        <p className="lab-approval-notice" role="status">
          此操作正在等待宿主审批，请在 {APP_DISPLAY_NAME} 宿主窗口确认或拒绝。
        </p>
      )}
      {state.phase === "closed" && (
        <div className="lab-closed-notice" role="status">
          <span>会话已关闭，消息已保留。</span>
          <button type="button" className="lab-button" onClick={reconnect}>
            重新连接
          </button>
        </div>
      )}
      <span className="lab-sr-only" role="status">
        {notice}
      </span>
      <div className="lab-workbench">
        {visible && compare && (
          <div
            className="lab-compare-switch"
            role="group"
            aria-label="双视图切换"
          >
            <button
              type="button"
              aria-pressed={comparePane === "primary"}
              onClick={() => setComparePane("primary")}
            >
              主视图
            </button>
            <button
              type="button"
              aria-pressed={comparePane === "secondary"}
              onClick={() => setComparePane("secondary")}
            >
              第二视图
            </button>
            <span>共享消息，草稿独立</span>
          </div>
        )}
        <div
          className={`lab-chat-panes ${visible && compare ? "lab-compare" : ""}`}
        >
          {!visible ? (
            <div className="lab-empty">
              <MessageCircle aria-hidden="true" className="lab-empty-icon" />
              <h2>聊天视图已隐藏</h2>
              <p>会话继续运行，恢复视图即可查看结果。</p>
              <button
                type="button"
                className="lab-button"
                onClick={() => setVisible(true)}
              >
                恢复聊天视图
              </button>
            </div>
          ) : (
            <>
              <section
                className={`lab-chat-pane ${comparePane === "primary" ? "is-active" : ""}`}
                aria-label="主聊天视图"
              >
                {compare && (
                  <div className="lab-pane-heading">
                    主视图 · {mode === "custom" ? "定制界面" : "默认界面"}
                  </div>
                )}
                {mode === "default" ? (
                  <Chat
                    session={session}
                    viewId="playground"
                    className="lab-default-chat"
                    composer={{ className: "lab-composer" }}
                  />
                ) : (
                  <Chat.Layout className="lab-custom-chat">
                    {state.messages.length ? (
                      <Chat.Messages
                        className="lab-messages"
                        renderMessage={renderMessage}
                      />
                    ) : (
                      <div className="lab-empty lab-chat-intro">
                        <MessageCircle
                          aria-hidden="true"
                          className="lab-empty-icon"
                        />
                        <h2>发送第一条消息</h2>
                        <p>体验流式回复，或从一个示例开始。</p>
                        <button
                          type="button"
                          className="lab-button lab-quiet"
                          onClick={() => setExamples(true)}
                        >
                          选择体验示例
                        </button>
                      </div>
                    )}
                    <Chat.Footer className="lab-footer">
                      <Chat.Error />
                      <Chat.Question />
                      <Chat.Composer
                        className="lab-composer"
                        placeholder="输入消息，或从体验示例开始…"
                      />
                    </Chat.Footer>
                  </Chat.Layout>
                )}
              </section>
              {compare && (
                <section
                  className={`lab-chat-pane lab-secondary ${comparePane === "secondary" ? "is-active" : ""}`}
                  aria-label="第二聊天视图"
                >
                  <div className="lab-pane-heading">第二视图 · 独立草稿</div>
                  <Chat
                    session={session}
                    viewId="playground-secondary"
                    className="lab-default-chat"
                    composer={{ className: "lab-composer" }}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <QuickPrompts
        preset={preset}
        session={session}
        open={examples}
        onClose={() => setExamples(false)}
        onApplied={() => {
          setExamples(false);
          setVisible(true);
          setComparePane("primary");
          setNotice("示例已填入主视图，确认后发送。");
        }}
      />
      <LabDialog
        open={inspect}
        title="调试与设置"
        onClose={() => setInspect(false)}
      >
        <section className="lab-settings-section">
          <h3>界面模式</h3>
          <div className="lab-tabs" role="group" aria-label="聊天界面模式">
            <button
              type="button"
              aria-pressed={mode === "custom"}
              onClick={() => setMode("custom")}
            >
              定制界面
            </button>
            <button
              type="button"
              aria-pressed={mode === "default"}
              onClick={() => setMode("default")}
            >
              默认界面
            </button>
          </div>
          <p className="lab-help">切换布局时保留同一会话与主视图草稿。</p>
          <label className="lab-setting-toggle">
            <span>
              <strong>双视图对照</strong>
              <small>在两个视图中观察同一会话；窄窗可切换查看。</small>
            </span>
            <input
              type="checkbox"
              checked={compare}
              onChange={(event) => {
                setCompare(event.target.checked);
                setComparePane("primary");
              }}
            />
          </label>
          <label className="lab-setting-toggle">
            <span>
              <strong>隐藏聊天视图</strong>
              <small>暂时卸载聊天界面，后台任务继续运行。</small>
            </span>
            <input
              type="checkbox"
              checked={!visible}
              onChange={(event) => setVisible(!event.target.checked)}
            />
          </label>
        </section>
        <Inspector session={session} />
      </LabDialog>
    </>
  );
}
function Connection({
  input,
  retry,
  onSaved,
  preset,
  showPreset,
  onPresetShown,
}: {
  input: ApplicationChatOpenInput;
  retry(): void;
  onSaved(): void;
  preset?: ChatPreset;
  showPreset: boolean;
  onPresetShown(): void;
}) {
  const { session, error } = useApplicationChatSession(input);
  useEffect(() => {
    if (!session) return;
    onSaved();
    let previous = session.getSnapshot();
    return session.subscribe(() => {
      const next = session.getSnapshot();
      if (
        !next.dirty &&
        next.messages.length &&
        (next.phase === "idle" || next.phase === "closed") &&
        (previous.dirty || previous.phase !== next.phase)
      )
        onSaved();
      previous = next;
    });
  }, [session, onSaved]);
  if (!session)
    return (
      <div className="lab-empty">
        <Chat.Loading error={error} />
        {error && (
          <button type="button" onClick={retry}>
            重试连接
          </button>
        )}
      </div>
    );
  return (
    <Chat.Provider session={session} viewId="playground">
      <Workbench
        session={session}
        preset={preset}
        showPreset={showPreset}
        onPresetShown={onPresetShown}
        reconnect={retry}
      />
    </Chat.Provider>
  );
}
export default function ChatLab({
  preset,
  code,
}: {
  preset?: ChatPreset;
  code: string;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [viewedPreset, setViewedPreset] = useState<ChatPreset>();
  const acknowledgePreset = useCallback(
    () => setViewedPreset(preset),
    [preset],
  );
  const [workspaces, setWorkspaces] = useState<ApplicationWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const selectedWorkspaceId = useRef("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const creatingWorkspaceRef = useRef(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const resume = useRef<{ workspaceId: string; chatId: string } | undefined>(
    undefined,
  );
  const preferences = useRef<ReturnType<
    typeof createPlaygroundPreferences
  > | null>(null);
  const getPreferences = useCallback(
    () =>
      (preferences.current ??= createPlaygroundPreferences(
        getApplicationDataClient().storage,
      )),
    [],
  );
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [connection, setConnection] = useState<{
    input: ApplicationChatOpenInput;
    version: number;
  }>();
  const [history, setHistory] = useState<{
    workspaceId: string;
    items: ApplicationChatSummary[];
    loading: boolean;
    error?: string;
  }>({ workspaceId: "", items: [], loading: false });
  const historyGeneration = useRef(0);
  const selectionSaveGeneration = useRef(0);
  const persistSelection = (id: string, selectedChatId?: string) => {
    const current = ++selectionSaveGeneration.current;
    setStorageError("");
    void getPreferences()
      .select(id, selectedChatId)
      .catch((error) => {
        if (current === selectionSaveGeneration.current)
          setStorageError(errorText(error));
      });
  };
  const reloadHistory = useCallback(async () => {
    const current = ++historyGeneration.current;
    if (!workspaceId) {
      setHistory({ workspaceId, items: [], loading: false });
      return;
    }
    setHistory((previous) => ({
      workspaceId,
      items: previous.workspaceId === workspaceId ? previous.items : [],
      loading: true,
    }));
    try {
      const items = await getApplicationChatClient().listSessions({
        workspaceId,
      });
      if (current === historyGeneration.current) {
        setHistory({ workspaceId, items, loading: false });
        if (resume.current?.workspaceId === workspaceId) {
          const chatId = resume.current.chatId;
          resume.current = undefined;
          // Empty sessions are not saved until their first message; never recreate a missing record.
          if (items.some((item) => item.chatId === chatId)) {
            setConnection((previous) => ({
              input: { workspaceId, chatId },
              version: (previous?.version ?? 0) + 1,
            }));
          }
        }
      }
    } catch (error) {
      if (current === historyGeneration.current)
        setHistory({
          workspaceId,
          items: [],
          loading: false,
          error: errorText(error),
        });
    }
  }, [workspaceId, selectionVersion]);
  useEffect(() => {
    void reloadHistory();
    return () => {
      historyGeneration.current++;
    };
  }, [reloadHistory]);
  const generation = useRef(0);
  const reload = useCallback(
    async (restoreSelection = true) => {
      const current = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const prefs = getPreferences();
        const [next] = await Promise.all([
          getApplicationDataClient().workspaces.list(),
          prefs.load(),
        ]);
        if (current !== generation.current) return;
        setWorkspaces(next);
        if (!restoreSelection) return;
        const selected = prefs.workspace(next);
        if (selected) {
          if (selectedWorkspaceId.current !== selected.id) {
            setConnection(undefined);
          }
          selectedWorkspaceId.current = selected.id;
          setWorkspaceId(selected.id);
          resume.current = {
            workspaceId: selected.id,
            chatId: prefs.chat(selected.id),
          };
          setSelectionVersion((value) => value + 1);
        }
      } catch (error) {
        if (current === generation.current) setError(errorText(error));
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [getPreferences],
  );
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  const activateSession = (targetWorkspace: string, targetChat: string) => {
    resume.current = undefined;
    if (selectedWorkspaceId.current !== targetWorkspace) {
      historyGeneration.current++;
      selectedWorkspaceId.current = targetWorkspace;
      setWorkspaceId(targetWorkspace);
      setSelectionVersion((value) => value + 1);
    }
    setSessionsOpen(false);
    persistSelection(targetWorkspace, targetChat);
    setConnection((previous) => ({
      input: { workspaceId: targetWorkspace, chatId: targetChat },
      version: (previous?.version ?? 0) + 1,
    }));
  };
  const connect = async (nextId: string, targetWorkspace: string) => {
    if (
      !targetWorkspace ||
      !nextId.trim() ||
      loading ||
      creatingWorkspaceRef.current ||
      creatingRef.current ||
      openingRef.current
    )
      return;
    openingRef.current = true;
    setOpening(true);
    setError("");
    try {
      // Validate before dismissing the manager so failures stay next to the input.
      await getApplicationChatClient().openSession({
        workspaceId: targetWorkspace,
        chatId: nextId.trim(),
      });
      activateSession(targetWorkspace, nextId.trim());
    } catch (error) {
      setError(errorText(error));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };
  const create = async (targetWorkspace = workspaceId) => {
    if (
      !targetWorkspace ||
      loading ||
      creatingRef.current ||
      creatingWorkspaceRef.current ||
      openingRef.current
    )
      return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    try {
      const session = await getApplicationChatClient().createSession({
        workspaceId: targetWorkspace,
        sceneId: "debug",
        profile,
      });
      activateSession(targetWorkspace, session.identity.id);
    } catch (error) {
      setError(errorText(error));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const addWorkspace = async (
    name: string,
  ): Promise<ApplicationWorkspace | null> => {
    if (
      !name.trim() ||
      loading ||
      creatingRef.current ||
      creatingWorkspaceRef.current ||
      openingRef.current
    )
      return null;
    creatingWorkspaceRef.current = true;
    setCreatingWorkspace(true);
    setError("");
    try {
      const workspace = await getApplicationDataClient().workspaces.create({
        name: name.trim(),
      });
      if (!workspace) return null;
      setWorkspaces((items) => [
        ...items.filter((item) => item.id !== workspace.id),
        workspace,
      ]);
      return workspace;
    } catch (error) {
      setError(errorText(error));
      return null;
    } finally {
      creatingWorkspaceRef.current = false;
      setCreatingWorkspace(false);
    }
  };
  const openSessions = () => {
    setError("");
    setSessionsOpen(true);
  };
  const activeWorkspace = workspaces.find((item) => item.id === workspaceId);
  const activeTitle =
    history.workspaceId === workspaceId
      ? history.items.find((item) => item.chatId === connection?.input.chatId)
          ?.title
      : undefined;
  const busy = loading || creating || creatingWorkspace || opening;
  return (
    <section className="lab-app" aria-label="聊天能力体验">
      <header className="lab-toolbar">
        <div className="lab-title">
          <h1>AI 与对话</h1>
          <p title={activeTitle || activeWorkspace?.name}>
            {activeWorkspace?.name ?? (loading ? "加载工作区…" : "选择工作区")}
            {connection && <> · {activeTitle || "新对话"}</>}
          </p>
        </div>
        <div className="lab-toolbar-actions">
          <button
            type="button"
            className="lab-button"
            aria-label="会话与工作区"
            aria-haspopup="dialog"
            onClick={openSessions}
          >
            <History aria-hidden="true" />
            <span>会话</span>
          </button>
          <button
            type="button"
            className="lab-button lab-primary"
            disabled={busy || !workspaceId}
            onClick={() => void create()}
          >
            <Plus aria-hidden="true" />
            <span>{creating ? "创建中…" : "新对话"}</span>
          </button>
          <button
            type="button"
            className="lab-icon-button"
            aria-label="查看接入代码"
            title="查看接入代码"
            aria-haspopup="dialog"
            onClick={() => setCodeOpen(true)}
          >
            <Code2 aria-hidden="true" />
          </button>
        </div>
      </header>
      {storageError && (
        <p className="lab-top-error" role="alert">
          选择保存失败：{storageError}
        </p>
      )}
      {error && !sessionsOpen && (
        <p className="lab-top-error" role="alert">
          {error}
        </p>
      )}
      {connection ? (
        <Connection
          key={`${connection.input.workspaceId}:${connection.input.chatId}:${connection.version}`}
          input={connection.input}
          preset={preset}
          showPreset={preset !== viewedPreset}
          onPresetShown={acknowledgePreset}
          onSaved={reloadHistory}
          retry={() =>
            setConnection(
              (value) => value && { ...value, version: value.version + 1 },
            )
          }
        />
      ) : (
        <div className="lab-empty lab-welcome">
          <MessageCircle aria-hidden="true" className="lab-empty-icon" />
          <h2>{preset ? `体验${preset.label}` : "开始一段对话"}</h2>
          <p>
            {!loading && !workspaces.length
              ? "先选择一个工作区，用来保存对话。"
              : "发送消息、体验工具调用，随时恢复历史对话。"}
          </p>
          {activeWorkspace ? (
            <button
              type="button"
              className="lab-button lab-primary"
              disabled={busy}
              onClick={() => void create()}
            >
              <Plus aria-hidden="true" />
              {creating ? "创建中…" : "新建对话"}
            </button>
          ) : (
            <button
              type="button"
              className="lab-button lab-primary"
              onClick={openSessions}
            >
              选择工作区
            </button>
          )}
          <button
            type="button"
            className="lab-button lab-quiet"
            onClick={openSessions}
          >
            查看历史对话
          </button>
        </div>
      )}
      <SessionManager
        open={sessionsOpen}
        workspaces={workspaces}
        activeWorkspaceId={workspaceId}
        activeChatId={connection?.input.chatId}
        busy={busy}
        creatingWorkspace={creatingWorkspace}
        error={error || (storageError ? `选择保存失败：${storageError}` : "")}
        onClose={() => {
          setSessionsOpen(false);
          setError("");
        }}
        onClearError={() => setError("")}
        onRefresh={() => reload(false)}
        onCreate={create}
        onConnect={connect}
        onAddWorkspace={addWorkspace}
      />
      <LabDialog
        open={codeOpen}
        title="接入对话能力"
        onClose={() => setCodeOpen(false)}
      >
        <p className="lab-panel-intro">
          创建工作区内的会话，再交给共享 Chat 组件渲染。
        </p>
        <CodeExample code={code} open title="最小接入示例" />
      </LabDialog>
    </section>
  );
}
