import "./styles.css";
import { HostTools } from "./components/HostTools";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getPluginChatClient,
  type ChatMessage,
  type ChatPhase,
  type PluginChatOpenInput,
  type PluginChatSummary,
  type PluginChatSession,
  type OperationResult,
} from "@isle/plugin-sdk/chat";
import { Chat, useChatComposer, useChatSnapshot, usePluginChatSession } from "@isle/plugin-sdk/chat/react";
import { getPluginDataClient, type PluginWorkspace } from "@isle/plugin-sdk/data";
import { createPlaygroundPreferences } from "./preferences";

const profile = {
  id: "chat-playground-v1",
  systemPrompt:
    "你是 Isle 聊天调试助手，用中文简洁回答。按用户要求演示 Markdown、代码和插件工具。需要验证工具时，使用用户指定的工具；未指定时调用 chat_playground_echo。不要虚构工具执行或宿主状态。",
  useKnowledge: true,
};
const phases: Record<ChatPhase, string> = {
  initializing: "初始化",
  idle: "空闲",
  preparing: "准备中",
  submitting: "提交中",
  running: "生成中",
  waiting: "等待回答",
  stopping: "停止中",
  closing: "关闭中",
  closed: "已关闭",
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const prompts = [
  { label: "Markdown", text: "请用 Markdown 演示一个三级标题、三项列表、一个两列表格和一段 TypeScript 代码。" },
  { label: "低风险工具", text: "请调用 chat_playground_echo，text 设为“Hello Isle 👋”，然后说明返回的文本和字符数。" },
  {
    label: "中风险工具",
    text: "请调用 chat_playground_medium_risk，text 设为“中风险审批测试”，然后说明实际返回的文本和字符数。",
  },
  {
    label: "技能示例",
    text: "请使用 chat-playground-text-inspection 技能，分析文本“Hello Isle 👋”的字符数、UTF-8 字节数和 SHA-256，并解释字符数与字节数为什么不同。",
  },
  { label: "长回复 / 停止", text: "请分十个小节详细介绍如何设计一个聊天应用，每节写一段，方便我测试流式输出和停止。" },
];
function QuickPrompts() {
  const binding = useChatComposer();
  return (
    <div className="lab-prompts">
      <span>填入示例</span>
      {prompts.map(({ label, text }) => (
        <button
          type="button"
          key={label}
          disabled={binding.disabled}
          onClick={() => binding.setDraft({ text, blocks: [{ type: "text", content: text }] })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function renderMessage(message: ChatMessage, content: ReactNode) {
  return (
    <div className={`lab-message lab-message-${message.role}`} data-message-kind={message.role}>
      {content}
    </div>
  );
}
function Inspector({ session }: { session: PluginChatSession }) {
  const state = useChatSnapshot();
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const run = async (label: string, action: () => Promise<OperationResult | void>) => {
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
    (count, message) => count + message.blocks.filter((block) => block.type === "tool").length,
    0,
  );
  return (
    <aside className="lab-inspector" aria-label="会话检查器">
      <div className="lab-section-heading">
        <h2>会话检查器</h2>
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
          <dd>{state.saveError ? "失败" : state.dirty ? "待保存" : "已同步"}</dd>
        </div>
      </dl>
      <dl className="lab-facts">
        <dt>任务 ID</dt>
        <dd>{state.activeTaskId ?? "暂无任务"}</dd>
        <dt>模型</dt>
        <dd>
          {state.resources.models?.find((model) => model.value === state.config.selectedModelId)?.label ||
            state.config.selectedModelId ||
            "未选择"}
        </dd>
        <dt>已选能力</dt>
        <dd>
          技能 {state.config.selectedSkillKeys.length} · 可用工具 {state.resources.tools?.length ?? 0} · 知识库{" "}
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
      <p className="lab-help">关闭会话会停止任务并保存。再次点击顶部「连接会话」可恢复历史。</p>
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
        onClick={() => void run("应用上下文", () => session.setContext({ requestContext: context }))}
      >
        应用到后续请求
      </button>
      <p className="lab-help">上下文在宿主会话内生效；此输入不随插件页面重载恢复。</p>
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
function Workbench({ session }: { session: PluginChatSession }) {
  const state = useChatSnapshot();
  const [mode, setMode] = useState<"custom" | "default">("custom");
  const [visible, setVisible] = useState(true);
  const [compare, setCompare] = useState(false);
  const [inspect, setInspect] = useState(() => window.innerWidth > 900);
  return (
    <>
      <div className="lab-session-bar">
        <span className="lab-status" data-phase={state.phase}>
          <i aria-hidden="true" />
          {phases[state.phase]}
        </span>
        <div className="lab-tabs" aria-label="聊天界面模式">
          <button type="button" aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>
            定制界面
          </button>
          <button type="button" aria-pressed={mode === "default"} onClick={() => setMode("default")}>
            默认界面
          </button>
        </div>
        <div className="lab-view-actions">
          <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>
            双视图
          </button>
          <button type="button" onClick={() => setVisible(!visible)}>
            {visible ? "隐藏聊天" : "恢复聊天"}
          </button>
          <button type="button" aria-pressed={inspect} onClick={() => setInspect(!inspect)}>
            检查器
          </button>
        </div>
      </div>
      <div className={`lab-workbench ${inspect ? "lab-with-inspector" : ""}`}>
        <div className={`lab-chat-panes ${visible && compare ? "lab-compare" : ""}`}>
          {!visible ? (
            <div className="lab-empty">
              <h2>聊天视图已隐藏</h2>
              <p>会话继续运行，可以恢复视图查看结果。</p>
              <button type="button" onClick={() => setVisible(true)}>
                恢复聊天视图
              </button>
            </div>
          ) : (
            <>
              <section className="lab-chat-pane" aria-label="主聊天视图">
                {mode === "default" ? (
                  <Chat session={session} viewId="playground" />
                ) : (
                  <Chat.Layout className="lab-custom-chat">
                    <div className="lab-chat-heading">
                      <span>CHAT LAB</span>
                      <p>试一条消息，观察每一次变化。</p>
                    </div>
                    <Chat.Messages className="lab-messages" renderMessage={renderMessage} />
                    <Chat.Footer className="lab-footer">
                      <Chat.Error />
                      <Chat.Question />
                      <QuickPrompts />
                      <Chat.Composer className="lab-composer" placeholder="发送一条消息，开始调试…">
                        <span className="lab-composer-note">共享会话 · 自定义布局</span>
                      </Chat.Composer>
                    </Chat.Footer>
                  </Chat.Layout>
                )}
              </section>
              {compare && (
                <section className="lab-chat-pane lab-secondary" aria-label="第二聊天视图">
                  <div className="lab-secondary-heading">同一会话 · 独立草稿</div>
                  <Chat session={session} viewId="playground-secondary" />
                </section>
              )}
            </>
          )}
        </div>
        {inspect && <Inspector session={session} />}
      </div>
    </>
  );
}
function Connection({ input, retry, onSaved }: { input: PluginChatOpenInput; retry(): void; onSaved(): void }) {
  const { session, error } = usePluginChatSession(input);
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
      <Workbench session={session} />
    </Chat.Provider>
  );
}
export default function App() {
  const [workspaces, setWorkspaces] = useState<PluginWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const selectedWorkspaceId = useRef("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const creatingWorkspaceRef = useRef(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const resume = useRef<{ workspaceId: string; chatId: string } | undefined>(undefined);
  const preferences = useRef<ReturnType<typeof createPlaygroundPreferences> | null>(null);
  const getPreferences = useCallback(
    () => (preferences.current ??= createPlaygroundPreferences(getPluginDataClient().storage)),
    [],
  );
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [connection, setConnection] = useState<{ input: PluginChatOpenInput; version: number }>();
  const [history, setHistory] = useState<{
    workspaceId: string;
    items: PluginChatSummary[];
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
        if (current === selectionSaveGeneration.current) setStorageError(errorText(error));
      });
  };
  const selectWorkspace = (workspace: PluginWorkspace) => {
    historyGeneration.current++;
    selectedWorkspaceId.current = workspace.id;
    setWorkspaceId(workspace.id);
    setChatId("");
    setConnection(undefined);
    resume.current = { workspaceId: workspace.id, chatId: getPreferences().chat(workspace.id) };
    setSelectionVersion((value) => value + 1);
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
      const items = await getPluginChatClient().listSessions({ workspaceId });
      if (current === historyGeneration.current) {
        setHistory({ workspaceId, items, loading: false });
        if (resume.current?.workspaceId === workspaceId) {
          const chatId = resume.current.chatId;
          resume.current = undefined;
          // Empty sessions are not saved until their first message; never recreate a missing record.
          if (items.some((item) => item.chatId === chatId)) {
            setChatId(chatId);
            setConnection((previous) => ({ input: { workspaceId, chatId }, version: (previous?.version ?? 0) + 1 }));
          }
        }
      }
    } catch (error) {
      if (current === historyGeneration.current)
        setHistory({ workspaceId, items: [], loading: false, error: errorText(error) });
    }
  }, [workspaceId, selectionVersion]);
  useEffect(() => {
    void reloadHistory();
    return () => {
      historyGeneration.current++;
    };
  }, [reloadHistory]);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const prefs = getPreferences();
      const [next] = await Promise.all([getPluginDataClient().workspaces.list(), prefs.load()]);
      if (current !== generation.current) return;
      setWorkspaces(next);
      const selected = prefs.workspace(next);
      if (selected) {
        if (selectedWorkspaceId.current !== selected.id) {
          setChatId("");
          setConnection(undefined);
        }
        selectedWorkspaceId.current = selected.id;
        setWorkspaceId(selected.id);
        resume.current = { workspaceId: selected.id, chatId: prefs.chat(selected.id) };
        setSelectionVersion((value) => value + 1);
      }
    } catch (error) {
      if (current === generation.current) setError(errorText(error));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [getPreferences]);
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  const connect = (nextId = chatId) => {
    if (!workspaceId || !nextId.trim() || loading || creatingWorkspaceRef.current || creatingRef.current) return;
    resume.current = undefined;
    setChatId(nextId.trim());
    persistSelection(workspaceId, nextId.trim());
    setConnection((previous) => ({
      input: { workspaceId, chatId: nextId.trim() },
      version: (previous?.version ?? 0) + 1,
    }));
  };
  const create = async () => {
    if (!workspaceId || loading || creatingRef.current || creatingWorkspaceRef.current) return;
    resume.current = undefined;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    const targetWorkspace = workspaceId;
    try {
      const session = await getPluginChatClient().createSession({
        workspaceId: targetWorkspace,
        sceneId: "debug",
        profile,
      });
      setChatId(session.identity.id);
      persistSelection(targetWorkspace, session.identity.id);
      setConnection((previous) => ({
        input: { workspaceId: targetWorkspace, chatId: session.identity.id },
        version: (previous?.version ?? 0) + 1,
      }));
    } catch (error) {
      setError(errorText(error));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const addWorkspace = async () => {
    if (!workspaceName.trim() || loading || creatingRef.current || creatingWorkspaceRef.current) return;
    creatingWorkspaceRef.current = true;
    setCreatingWorkspace(true);
    setError("");
    try {
      const workspace = await getPluginDataClient().workspaces.create({ name: workspaceName.trim() });
      if (!workspace) return;
      setWorkspaces((items) => [...items.filter((item) => item.id !== workspace.id), workspace]);
      selectWorkspace(workspace);
      persistSelection(workspace.id);
      setAddingWorkspace(false);
      setWorkspaceName("");
    } catch (error) {
      setError(errorText(error));
    } finally {
      creatingWorkspaceRef.current = false;
      setCreatingWorkspace(false);
    }
  };
  return (
    <main className="lab-app">
      <header className="lab-header">
        <div className="lab-brand">
          <span className="lab-mark" aria-hidden="true">
            C
          </span>
          <div>
            <h1>聊天调试台</h1>
            <p>选择插件自己的工作区，保存和继续调试对话。</p>
          </div>
        </div>
        <span className="lab-badge">ISLE PLUGIN</span>
      </header>
      <HostTools />
      <div className="lab-connection-form">
        <label>
          工作区
          <select
            aria-label="工作区"
            value={workspaceId}
            disabled={loading || creating || creatingWorkspace}
            onChange={(event) => {
              const workspace = workspaces.find((item) => item.id === event.target.value);
              if (workspace) {
                selectWorkspace(workspace);
                persistSelection(workspace.id);
              }
            }}
          >
            {!workspaces.length && <option value="">{loading ? "加载中…" : "暂无工作区"}</option>}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
                {workspace.isDefault ? " · 默认" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="lab-refresh"
          disabled={loading || creating || creatingWorkspace}
          onClick={() => void reload()}
        >
          刷新工作区
        </button>
        <button
          type="button"
          disabled={loading || creating || creatingWorkspace}
          aria-expanded={addingWorkspace}
          onClick={() => setAddingWorkspace((value) => !value)}
        >
          新增工作区
        </button>
        <label className="lab-history-select">
          插件对话
          <select
            aria-label="插件对话"
            disabled={
              loading ||
              creating ||
              creatingWorkspace ||
              !workspaceId ||
              history.workspaceId !== workspaceId ||
              history.loading
            }
            value={
              connection?.input.workspaceId === workspaceId &&
              history.items.some((item) => item.chatId === connection.input.chatId)
                ? connection.input.chatId
                : ""
            }
            onChange={(event) => {
              if (event.target.value) connect(event.target.value);
            }}
          >
            <option value="">
              {history.loading ? "加载对话…" : history.items.length ? "选择已保存对话" : "暂无已保存对话"}
            </option>
            {history.workspaceId === workspaceId &&
              history.items.map((item) => (
                <option key={item.chatId} value={item.chatId}>
                  {item.title} · {item.messageCount} 条消息
                </option>
              ))}
          </select>
        </label>
        <button type="button" disabled={!workspaceId || history.loading} onClick={() => void reloadHistory()}>
          刷新对话
        </button>
        <label>
          已有会话 ID
          <input
            aria-label="会话 ID"
            value={chatId}
            maxLength={128}
            onChange={(event) => setChatId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") connect();
            }}
          />
        </label>
        <button
          type="button"
          className="lab-primary"
          disabled={loading || creating || creatingWorkspace || !workspaceId || !chatId.trim()}
          onClick={() => connect()}
        >
          连接会话
        </button>
        <button
          type="button"
          disabled={loading || creating || creatingWorkspace || !workspaceId}
          onClick={() => void create()}
        >
          {creating ? "创建中…" : "新会话"}
        </button>
      </div>
      {addingWorkspace && (
        <div className="lab-connection-form lab-workspace-create">
          <label>
            工作区名称
            <input
              aria-label="工作区名称"
              value={workspaceName}
              maxLength={512}
              disabled={creatingWorkspace}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="lab-primary"
            disabled={loading || creating || creatingWorkspace || !workspaceName.trim()}
            onClick={() => void addWorkspace()}
          >
            {creatingWorkspace ? "等待目录选择…" : "选择目录并创建"}
          </button>
          <button type="button" disabled={creatingWorkspace} onClick={() => setAddingWorkspace(false)}>
            取消
          </button>
        </div>
      )}
      {workspaces.find((item) => item.id === workspaceId) && (
        <p className="lab-workspace-path">
          工作区目录：<code>{workspaces.find((item) => item.id === workspaceId)?.path}</code>
        </p>
      )}
      {storageError && (
        <p className="lab-top-error" role="alert">
          选择保存失败：{storageError}
        </p>
      )}
      {history.error && history.workspaceId === workspaceId && (
        <p className="lab-top-error" role="alert">
          对话列表加载失败：{history.error}
        </p>
      )}
      {error && (
        <p className="lab-top-error" role="alert">
          {error}
        </p>
      )}
      {connection ? (
        <>
          <div className="lab-connected-to">
            当前连接：
            {workspaces.find((item) => item.id === connection.input.workspaceId)?.name ?? connection.input.workspaceId}
            <span> / </span>
            <code>{connection.input.chatId}</code>
          </div>
          <Connection
            key={`${connection.input.workspaceId}:${connection.input.chatId}:${connection.version}`}
            input={connection.input}
            onSaved={reloadHistory}
            retry={() => setConnection((value) => value && { ...value, version: value.version + 1 })}
          />
        </>
      ) : (
        <div className="lab-empty lab-welcome">
          <div className="lab-orbit" aria-hidden="true">
            ↗
          </div>
          <h2>从一个会话开始</h2>
          <p>
            {!loading && !workspaces.length
              ? "工作区尚未加载成功，请重试或新增工作区。"
              : "选择工作区后新建会话，或从插件对话列表恢复历史。"}
          </p>
          <p className="lab-help">切换会话或隐藏界面时，后台任务会继续。</p>
        </div>
      )}
    </main>
  );
}
