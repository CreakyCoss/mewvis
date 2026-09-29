import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import {
  Chat,
  useChatComposer,
  useChatSnapshot,
} from "@isle/app-sdk/chat/react";
import {
  ClipboardCheck,
  History,
  ListChecks,
  Plus,
  Sparkles,
  Square,
} from "lucide-react";
import { tutorProfile } from "./generation";
import { recoverMissingChat } from "./chatRecovery";
import type { Course, Lesson } from "./course";

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function Icon({
  name,
  size = 20,
}: {
  name:
    | "book"
    | "plus"
    | "arrow"
    | "send"
    | "spark"
    | "check"
    | "back"
    | "chevronLeft"
    | "chevronUp"
    | "chevronDown"
    | "trash";
  size?: number;
}) {
  const paths = {
    book: (
      <>
        <path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
        <path d="M12 5v15" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    back: <path d="M20 12H5m6-6-6 6 6 6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="M21 2v4m-2-2h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" />
        <path d="M10 10v6m4-6v6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "send" ? 2 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="learn-notice" role="alert">
      {children}
    </div>
  );
}
export function Text({ value }: { value: string }) {
  return (
    <div className="learn-prose">
      {value.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
export { Quiz } from "./Quiz";
export type FocusTarget =
  "objective" | "example" | "takeaways" | "recall" | "quiz";
export function Tutor({
  course,
  lesson,
  panels,
  expanded,
  onToggleExpand,
}: {
  course: Course;
  lesson: Lesson;
  panels: Record<"grading" | "mistakes" | "history", ReactNode>;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<
    "chat" | "grading" | "mistakes" | "history"
  >("chat");
  const [chatBusy, setChatBusy] = useState(false);
  const connecting = useRef(false);
  const connect = async (fresh = false) => {
    if (connecting.current) return;
    connecting.current = true;
    setBusy(true);
    setError("");
    try {
      const data = getApplicationDataClient();
      const workspaces = await data.workspaces.list();
      const workspace = workspaces.find((w) => w.isDefault) ?? workspaces[0];
      if (!workspace)
        throw new Error("尚无学习工作区，请在 Isle 中重新打开应用");
      const key = `learning:tutor:${course.id}:${lesson.id}`;
      const previous = await data.storage.getItem<{
        workspaceId: string;
        chatId: string;
      }>(key);
      const client = getApplicationChatClient();
      const create = async () => {
        const created = await client.createSession({
          workspaceId: workspace.id,
          sceneId: "learning-tutor",
          profile: {
            ...tutorProfile,
            context: {
              requestContext: JSON.stringify({ course: course.title, lesson }),
            },
          },
        });
        try {
          await data.storage.setItem(key, {
            workspaceId: workspace.id,
            chatId: created.identity.id,
          });
        } catch (e) {
          await created.close();
          throw e;
        }
        return created;
      };
      setSession(
        previous && !fresh
          ? await recoverMissingChat(() => client.openSession(previous), create)
          : await create(),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      connecting.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    void connect();
  }, []);
  useEffect(() => {
    if (!session) return;
    const update = () =>
      setChatBusy(!["idle", "closed"].includes(session.getSnapshot().phase));
    update();
    return session.subscribe(update);
  }, [session]);
  const tabs = [
    { id: "chat", label: "助手", title: "学习助手", icon: Sparkles },
    {
      id: "grading",
      label: "评阅",
      title: "简答题 AI 评阅",
      icon: ClipboardCheck,
    },
    { id: "mistakes", label: "错题", title: "错题本", icon: ListChecks },
    { id: "history", label: "记录", title: "练习记录", icon: History },
  ] as const;
  return (
    <aside
      className="learn-tutor learn-study-assistant"
      aria-label="学习助手工具区"
    >
      <div className="learn-study-assistant-main">
        <header className="learn-study-assistant-header">
          <h2>{tabs.find((item) => item.id === panel)?.title}</h2>
          <div>
            {panel === "chat" && (
              <button
                className="learn-assistant-icon-button"
                aria-label="新开导师对话"
                title="新开对话"
                disabled={busy || chatBusy}
                onClick={() => void connect(true)}
              >
                <Plus size={17} />
              </button>
            )}
            <button
              className="learn-tutor-expand"
              onClick={onToggleExpand}
              aria-expanded={expanded}
            >
              {expanded ? "返回课程" : "展开助手"}
            </button>
          </div>
        </header>
        {tabs.map(({ id }) => (
          <section
            key={id}
            hidden={panel !== id}
            id={`learn-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`learn-tool-${id}`}
            className={`learn-study-pane ${id === "chat" ? "is-chat" : ""}`}
            tabIndex={0}
          >
            {id === "chat" ? (
              <>
                {error && <Notice>{error}</Notice>}
                {session ? (
                  <Chat.Provider
                    key={session.identity.id}
                    session={session}
                    viewId="learning-study"
                  >
                    <TutorConversation lesson={lesson} />
                  </Chat.Provider>
                ) : (
                  <div className="learn-panel-empty">
                    <p>
                      {busy
                        ? "正在准备导师对话…"
                        : "导师连接失败，已有对话记录仍保留。"}
                    </p>
                    {!busy && (
                      <button
                        className="learn-button"
                        onClick={() => void connect()}
                      >
                        重试连接
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              panels[id]
            )}
          </section>
        ))}
      </div>
      <nav
        className="learn-study-rail"
        role="tablist"
        aria-label="学习工具"
        aria-orientation="vertical"
      >
        {tabs.map(({ id, label, icon: ToolIcon }, index) => (
          <button
            key={id}
            id={`learn-tool-${id}`}
            role="tab"
            aria-selected={panel === id}
            aria-controls={`learn-panel-${id}`}
            tabIndex={panel === id ? 0 : -1}
            onClick={() => setPanel(id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowUp"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setPanel(tabs[next].id);
              document.getElementById(`learn-tool-${tabs[next].id}`)?.focus();
            }}
          >
            <ToolIcon size={18} strokeWidth={1.7} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function TutorConversation({
  lesson,
  reviewing = false,
}: {
  lesson: Lesson;
  reviewing?: boolean;
}) {
  const binding = useChatComposer();
  const snapshot = useChatSnapshot();
  const [contextOpen, setContextOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const contextDetailId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!contextOpen && !modelMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (contextOpen && !contextRef.current?.contains(event.target as Node))
        setContextOpen(false);
      if (modelMenuOpen && !modelMenuRef.current?.contains(event.target as Node))
        setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [contextOpen, modelMenuOpen]);
  const send = async () => {
    if (!binding.canSubmit || binding.disabled) return;
    setError("");
    try {
      const result = await binding.submit();
      if (result.status !== "dispatched")
        setError(result.reason || "发送失败，请重试");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const hasMessages = snapshot.messages.some(
    (message) => message.role === "user",
  );
  const models = binding.controls.resources.models ?? [];
  const selectedModelId = binding.controls.options.selectedModelId;
  const selectedModel = models.find((model) => model.value === selectedModelId);
  const selectedModelName = selectedModel?.selectedLabel || selectedModel?.label || "暂无可用模型";
  return (
    <>
      <div className="learn-study-conversation">
        {hasMessages ? (
          <Chat.Messages className="learn-study-messages" />
        ) : reviewing ? (
          <p className="learn-review-chat-empty">
            选择模型后，点击上方「开始评阅」。评阅过程中也可以继续补充要求。
          </p>
        ) : (
          <div className="learn-study-welcome">
            <Sparkles size={23} />
            <h3>一起弄懂这一课</h3>
            <p>聊聊不懂的概念，或让我给你一点提示。</p>
            {["用一个例子解释本课重点", "给我一个提示，先不要给答案"].map(
              (text) => (
                <button
                  key={text}
                  onClick={() => {
                    binding.setDraft({ text, blocks: [] });
                    input.current?.focus();
                  }}
                >
                  {text}
                  <Icon name="arrow" size={14} />
                </button>
              ),
            )}
          </div>
        )}
      </div>
      <div className={`learn-study-compose-area ${contextOpen || modelMenuOpen ? "is-popover-open" : ""}`}>
        <Chat.Error />
        <Chat.Question />
        {error && <Notice>{error}</Notice>}
        {snapshot.phase === "paused" && (
          <button
            className="learn-button"
            onClick={() => void binding.resume?.()}
          >
            继续生成
          </button>
        )}
        <div
          className="learn-study-context"
          ref={contextRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setContextOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !contextOpen) return;
            event.preventDefault();
            event.stopPropagation();
            setContextOpen(false);
            event.currentTarget.querySelector("button")?.focus();
          }}
        >
          <span title={lesson.title}>{lesson.title}</span>
          <button
            type="button"
            aria-expanded={contextOpen}
            aria-controls={contextOpen ? contextDetailId : undefined}
            onClick={() => {
              setModelMenuOpen(false);
              setContextOpen((open) => !open);
            }}
          >
            上下文
          </button>
          {contextOpen && (
            <div
              id={contextDetailId}
              className="learn-study-context-detail"
              role="note"
            >
              <strong>本课上下文</strong>
              <p>
                {reviewing
                  ? "评阅助手会参考本课讲解、题目、评分标准和本次作答，结果仅供学习参考。"
                  : "本课目标、讲解、示例、要点和测验题目会作为助手回答的参考资料；助手不会修改课程或学习进度。"}
              </p>
            </div>
          )}
        </div>
        <form
          className="learn-study-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={input}
            rows={3}
            aria-label="给学习助手的消息"
            placeholder={
              reviewing
                ? "补充评阅要求，或追问评分依据…"
                : "问不懂的地方，或说说你的理解…"
            }
            value={binding.draft.text}
            disabled={binding.disabled}
            onChange={(e) =>
              binding.setDraft({ text: e.target.value, blocks: [] })
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div
            className="learn-assistant-model"
            ref={modelMenuRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setModelMenuOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !modelMenuOpen) return;
              event.preventDefault();
              event.stopPropagation();
              setModelMenuOpen(false);
              modelTriggerRef.current?.focus();
            }}
          >
            <button
              ref={modelTriggerRef}
              type="button"
              className="learn-assistant-model-trigger"
              disabled={binding.busy || binding.disabled || models.length === 0}
              aria-label={`学习助手模型：${selectedModelName}`}
              aria-expanded={modelMenuOpen}
              title={selectedModelName}
              onClick={() => {
                setContextOpen(false);
                setModelMenuOpen((open) => !open);
              }}
            >
              <span>{selectedModelName}</span>
              <Icon name="chevronDown" size={15} />
            </button>
            {modelMenuOpen && (
              <div className="learn-assistant-model-menu" role="group" aria-label="可用学习助手模型">
                {models.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    aria-pressed={model.value === selectedModelId}
                    onClick={() => {
                      binding.controls.updateOptions({ selectedModelId: model.value });
                      setModelMenuOpen(false);
                      modelTriggerRef.current?.focus();
                    }}
                  >
                    <span>{model.selectedLabel || model.label}</span>
                    {model.value === selectedModelId && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {binding.busy ? (
            <button
              type="button"
              className="learn-study-send"
              aria-label="停止生成"
              onClick={() =>
                void binding
                  .stop()
                  .then((result) => {
                    if (!result.ok) setError(result.error);
                  })
                  .catch((e) => setError(errorText(e)))
              }
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className="learn-study-send"
              aria-label="发送给学习助手"
              disabled={!binding.canSubmit || binding.disabled}
            >
              <Icon name="send" size={16} />
            </button>
          )}
        </form>
      </div>
    </>
  );
}
