import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
  type ApplicationChatSummary,
  type ChatContext,
} from "@mewvis/app-sdk/chat";
import { Chat, useChatSnapshot } from "@mewvis/app-sdk/chat/react";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import { ArrowRight, History, Plus, Sparkles, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  FLOW_STEPS,
  type FilmProject,
  type FilmEpisode,
  type FlowStep,
} from "./model";
import { assistantContext } from "./assistant-context";
import { FilmComposer } from "./FilmComposer";

import {
  assistantKey,
  connections,
  reference,
  createSession,
  connect,
} from "./assistant-session";

const historyDate = (createdAt: number) =>
  new Date(createdAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function Assistant({
  project,
  episode,
  step,
  selectedShotId,
}: {
  project: FilmProject;
  episode: FilmEpisode;
  step: FlowStep;
  selectedShotId?: string;
}) {
  const key = assistantKey(project, episode.id);
  const [session, setSession] = useState<ApplicationChatSession>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(true);
  const [actionError, setActionError] = useState("");
  const [history, setHistory] = useState<ApplicationChatSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const switching = useRef(true);
  const generation = useRef(0);
  const appliedContext = useRef("");
  const phase = useSyncExternalStore(
    useCallback(
      (listener) => session?.subscribe(listener) ?? (() => {}),
      [session],
    ),
    useCallback(
      () => session?.getSnapshot().phase ?? "initializing",
      [session],
    ),
  );
  const latest = useRef({ project, episode, step, selectedShotId });
  latest.current = { project, episode, step, selectedShotId };
  useEffect(() => {
    let active = true;
    generation.current++;
    switching.current = true;
    setOpening(true);
    setSession(undefined);
    setError("");
    let promise = connections.get(key);
    if (!promise) {
      promise = connect(key, project.workspace?.id);
      connections.set(key, promise);
      void promise.catch(() => {
        if (connections.get(key) === promise) connections.delete(key);
      });
    }
    void promise
      .then(async (opened) => {
        if (!active) return;
        const value = latest.current;
        const next = assistantContext(
          value.project,
          value.episode,
          value.step,
          value.selectedShotId,
        );
        if (opened.getSnapshot().phase === "idle") {
          const result = await opened.setContext(next);
          if (!result.ok && opened.getSnapshot().phase === "idle")
            throw new Error(result.error);
          if (result.ok) appliedContext.current = next.requestContext;
        }
        if (active) setSession(opened);
      })
      .catch((error: unknown) => {
        if (active)
          setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) {
          switching.current = false;
          setOpening(false);
        }
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [key, attempt]);
  const loadHistory = async () => {
    const version = generation.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const current = await reference(key);
      if (!current) throw new Error("当前会话尚未连接");
      const chats = await getApplicationChatClient().listSessions({
        workspaceId: current.workspaceId,
      });
      if (version === generation.current)
        setHistory(
          chats
            .filter((chat) => chat.sceneId === key)
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
    } catch (e) {
      if (version === generation.current)
        setHistoryError(e instanceof Error ? e.message : "无法读取会话历史。");
    } finally {
      if (version === generation.current) setHistoryLoading(false);
    }
  };
  const openConversation = async (chatId?: string) => {
    if (
      switching.current ||
      submittingRef.current ||
      !session ||
      !["idle", "closed"].includes(session.getSnapshot().phase)
    )
      return;
    if (chatId === session.identity.id) return;
    switching.current = true;
    const version = ++generation.current;
    const previous = connections.get(key);
    setOpening(true);
    setActionError("");
    setHistoryLoading(false);
    const pending = (async () => {
      const current = await reference(key);
      if (!current) throw new Error("当前会话尚未连接");
      const value = latest.current;
      const context = assistantContext(
        value.project,
        value.episode,
        value.step,
        value.selectedShotId,
      );
      if (!chatId) return createSession(key, current.workspaceId, context);
      const opened = await getApplicationChatClient().openSession({
        workspaceId: current.workspaceId,
        chatId,
      });
      if (opened.getSnapshot().phase === "idle") {
        const result = await opened.setContext(context);
        if (!result.ok) throw new Error(result.error);
      }
      await getApplicationDataClient().storage.setItem(key, {
        workspaceId: current.workspaceId,
        chatId,
      });
      return opened;
    })();
    connections.set(key, pending);
    try {
      const opened = await pending;
      if (version === generation.current) {
        appliedContext.current = "";
        setSession(opened);
      }
    } catch (e) {
      if (connections.get(key) === pending) {
        if (previous) connections.set(key, previous);
        else connections.delete(key);
      }
      if (version === generation.current)
        setActionError(
          e instanceof Error ? e.message : "无法打开会话，请重试。",
        );
    } finally {
      if (version === generation.current) {
        switching.current = false;
        setOpening(false);
      }
    }
  };
  useEffect(() => {
    if (!session || opening || phase !== "idle") return;
    const next = assistantContext(project, episode, step, selectedShotId);
    if (next.requestContext === appliedContext.current) return;
    let active = true;
    const timer = setTimeout(() => {
      if (session.getSnapshot().phase !== "idle") return;
      void session
        .setContext(next)
        .then((result) => {
          if (result.ok) appliedContext.current = next.requestContext;
          else if (active && session.getSnapshot().phase === "idle")
            setError(result.error);
        })
        .catch((error: unknown) => {
          if (active)
            setError(error instanceof Error ? error.message : String(error));
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, opening, phase, project, episode, step, selectedShotId]);
  const conversationDisabled =
    opening || submitting || !session || !["idle", "closed"].includes(phase);
  return (
    <aside className="film-assistant" aria-label="影视创作助手">
      <header>
        <strong>创作助手</strong>
        <div className="film-assistant-header-actions">
          <DropdownMenu
            onOpenChange={(value) => {
              if (value) void loadHistory();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                className="film-icon-button"
                aria-label="会话历史"
                title="会话历史"
                disabled={conversationDisabled}
              >
                <History size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="film-popup film-history-menu"
            >
              <DropdownMenuLabel className="film-history-heading">
                <strong>会话历史</strong>
                <span>本集</span>
              </DropdownMenuLabel>
              {historyLoading ? (
                <p className="film-history-empty" role="status">
                  正在读取…
                </p>
              ) : historyError ? (
                <>
                  <p className="film-history-empty" role="alert">
                    {historyError}
                  </p>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void loadHistory();
                    }}
                  >
                    重试读取
                  </DropdownMenuItem>
                </>
              ) : history.length ? (
                <div className="film-history-list">
                  {history.map((item) => (
                    <DropdownMenuItem
                      key={item.chatId}
                      className="film-history-item"
                      aria-current={
                        item.chatId === session?.identity.id
                          ? "true"
                          : undefined
                      }
                      onSelect={() => void openConversation(item.chatId)}
                    >
                      <span className="film-history-item-title">
                        {item.title.trim() || "新会话"}
                      </span>
                      <span className="film-history-item-meta">
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          创建于 {historyDate(item.createdAt)}
                        </time>
                        {item.chatId === session?.identity.id && <em>当前</em>}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              ) : (
                <p className="film-history-empty">暂无会话历史</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="film-icon-button"
            aria-label="新建会话"
            title="新建会话"
            disabled={conversationDisabled}
            onClick={() => void openConversation()}
          >
            <Plus size={16} />
          </button>
        </div>
      </header>
      <p className="film-assistant-context">
        {FLOW_STEPS.find((s) => s.id === step)?.title} ·{" "}
        {step === "storyboard" && selectedShotId
          ? `镜头 ${String(episode.shots.findIndex((s) => s.id === selectedShotId) + 1).padStart(2, "0")}`
          : episode.title}
      </p>
      {actionError && (
        <p className="film-assistant-action-error" role="alert">
          {actionError}
        </p>
      )}
      {error ? (
        <div className="film-assistant-error">
          <p role="alert">{error}</p>
          <button
            onClick={() => {
              connections.delete(key);
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw size={16} />
            重新连接
          </button>
        </div>
      ) : session ? (
        <div className="film-assistant-chat">
          <Chat.Provider
            key={session.identity.id}
            session={session}
            viewId={`film-${episode.id}`}
          >
            <FilmConversation
              session={session}
              step={step}
              opening={opening}
              onSubmitting={(value) => {
                submittingRef.current = value;
                setSubmitting(value);
              }}
              source={
                selectedShotId
                  ? `镜头 ${String(episode.shots.findIndex((s) => s.id === selectedShotId) + 1).padStart(2, "0")}`
                  : episode.title
              }
            />
          </Chat.Provider>
        </div>
      ) : (
        <p className="film-connecting" role="status">
          正在连接创作助手…
        </p>
      )}
    </aside>
  );
}

function FilmConversation({
  session,
  step,
  source,
  opening,
  onSubmitting,
}: {
  session: ApplicationChatSession;
  step: FlowStep;
  source: string;
  opening: boolean;
  onSubmitting: (value: boolean) => void;
}) {
  const snapshot = useChatSnapshot();
  const [sending, setSending] = useState(false),
    [sendError, setSendError] = useState("");
  const hasConversation = snapshot.messages.some(
    (message) => message.role === "user",
  );
  const prompts =
    step === "storyboard"
      ? ["帮我优化当前镜头", "检查这组分镜的节奏", "角色和场景是否一致？"]
      : step === "script"
        ? [
            "帮我打磨这段剧本",
            "检查人物对白是否自然",
            "这集的转折可以怎样加强？",
          ]
        : [
            "当前步骤还需要准备什么？",
            "帮我梳理故事和视觉风格",
            "检查这部作品的制作计划",
          ];
  const suggest = async (text: string) => {
    setSending(true);
    onSubmitting(true);
    setSendError("");
    try {
      const result = await session.send({ text });
      if (result.status === "rejected")
        setSendError(result.reason || "消息发送失败，请重试。");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
      onSubmitting(false);
    }
  };
  return (
    <Chat.Layout className="film-chat-layout">
      {hasConversation ? (
        <Chat.Messages />
      ) : (
        <div className="film-assistant-welcome">
          <Sparkles size={27} />
          <h2>
            {step === "storyboard"
              ? "让每个镜头更有表现力"
              : "一起把故事变成画面"}
          </h2>
          <p>可以一起打磨画面、台词与镜头节奏。</p>
          <div className="film-assistant-suggestions">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                disabled={opening || sending || snapshot.phase !== "idle"}
                onClick={() => void suggest(prompt)}
              >
                {prompt}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      <Chat.Footer className="film-chat-footer">
        {sendError && (
          <p role="alert" className="film-error">
            {sendError}
          </p>
        )}
        <FilmComposer
          disabled={opening}
          onSubmitting={onSubmitting}
          source={source}
          placeholder={
            step === "storyboard"
              ? "聊聊这个镜头，或描述你想要的效果…"
              : "讨论剧本、角色或分镜…"
          }
        />
      </Chat.Footer>
    </Chat.Layout>
  );
}
