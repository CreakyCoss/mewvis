import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import {
  Chat,
  useChatComposer,
  useChatSession,
  useChatSnapshot,
} from "@isle/app-sdk/chat/react";
import {
  History,
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
const tutorMinWidth = 320;
const tutorMaxWidth = 720;
const tutorWidthBounds = (tutor: HTMLElement | null) => {
  const classroom = tutor?.parentElement;
  const outline = classroom?.querySelector<HTMLElement>(".learn-outline");
  const outlineWidth = outline && getComputedStyle(outline).display !== "none"
    ? outline.getBoundingClientRect().width
    : 0;
  return {
    min: tutorMinWidth,
    max: Math.max(
      tutorMinWidth,
      Math.min(tutorMaxWidth, (classroom?.getBoundingClientRect().width ?? 0) - outlineWidth - 300),
    ),
  };
};
const clampTutorWidth = (width: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, width)));
export function Tutor({
  course,
  lesson,
  panels,
  expanded,
  request,
  onRequestHandled,
  onToggleExpand,
  onWidthChange,
}: {
  course: Course;
  lesson: Lesson;
  panels: Record<"practice", ReactNode>;
  expanded: boolean;
  request: { id: string; courseId: string; lessonId: string; prompt: string } | null;
  onRequestHandled: (id: string) => void;
  onToggleExpand: () => void;
  onWidthChange: (width: number | null) => void;
}) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"chat" | "practice">("chat");
  const [chatBusy, setChatBusy] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(400);
  const [resizeBounds, setResizeBounds] = useState({ min: tutorMinWidth, max: tutorMaxWidth });
  const connecting = useRef(false);
  const handledRequest = useRef("");
  const tutorRef = useRef<HTMLElement>(null);
  const resizeDrag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    min: number;
    max: number;
  } | null>(null);
  useEffect(() => {
    const tutor = tutorRef.current;
    const classroom = tutor?.parentElement;
    if (!tutor || !classroom) return;
    const measure = () => {
      const nextWidth = Math.round(tutor.getBoundingClientRect().width);
      const nextBounds = tutorWidthBounds(tutor);
      setMeasuredWidth((current) => current === nextWidth ? current : nextWidth);
      setResizeBounds((current) =>
        current.min === nextBounds.min && current.max === nextBounds.max
          ? current
          : nextBounds,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tutor);
    observer.observe(classroom);
    return () => observer.disconnect();
  }, []);
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeDrag.current?.pointerId !== event.pointerId) return;
    resizeDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
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
  useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    if (request.courseId !== course.id || request.lessonId !== lesson.id) {
      onRequestHandled(request.id);
      return;
    }
    setPanel("chat");
    requestAnimationFrame(() =>
      tutorRef.current?.querySelector<HTMLButtonElement>("#learn-tool-chat")?.focus(),
    );
    if (busy || connecting.current) return;
    if (!session) {
      handledRequest.current = request.id;
      setError("学习助手未连接，请重试连接后再次点击 AI 解析。");
      onRequestHandled(request.id);
      return;
    }
    const dispatch = () => {
      if (handledRequest.current === request.id) return;
      const snapshot = session.getSnapshot();
      if (!snapshot.initialized && !snapshot.initializationError) return;
      handledRequest.current = request.id;
      onRequestHandled(request.id);
      if (snapshot.initializationError) {
        setError(snapshot.initializationError);
        return;
      }
      if (snapshot.phase !== "idle") {
        setError("学习助手正在回复，请稍后再试。");
        return;
      }
      setError("");
      void session.send({ text: request.prompt, requestId: request.id })
        .then((result) => {
          if (handledRequest.current === request.id && result.status !== "dispatched")
            setError(result.reason || "发送失败，请重试。");
        })
        .catch((e) => {
          if (handledRequest.current === request.id) setError(errorText(e));
        });
    };
    const unsubscribe = session.subscribe(dispatch);
    dispatch();
    return unsubscribe;
  }, [request, session, busy, course.id, lesson.id, onRequestHandled]);
  const tabs = [
    { id: "chat", label: "助手", icon: Sparkles },
    { id: "practice", label: "记录", icon: History },
  ] as const;
  return (
    <aside
      ref={tutorRef}
      className="learn-tutor learn-study-assistant"
      aria-label="学习助手工具区"
    >
      <div
        className="learn-study-resize-handle"
        role="separator"
        aria-label="调整学习助手宽度"
        aria-orientation="vertical"
        aria-valuemin={resizeBounds.min}
        aria-valuemax={resizeBounds.max}
        aria-valuenow={measuredWidth}
        aria-valuetext={`${measuredWidth} 像素`}
        tabIndex={0}
        title="左右拖动调整宽度，双击恢复默认"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          const bounds = tutorWidthBounds(tutorRef.current);
          resizeDrag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: tutorRef.current?.getBoundingClientRect().width ?? measuredWidth,
            ...bounds,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const drag = resizeDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          onWidthChange(clampTutorWidth(
            drag.startWidth + drag.startX - event.clientX,
            drag.min,
            drag.max,
          ));
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={() => { resizeDrag.current = null; }}
        onDoubleClick={() => onWidthChange(null)}
        onKeyDown={(event) => {
          const bounds = tutorWidthBounds(tutorRef.current);
          const next = event.key === "ArrowLeft"
            ? measuredWidth + 24
            : event.key === "ArrowRight"
              ? measuredWidth - 24
              : event.key === "Home"
                ? bounds.min
                : event.key === "End"
                  ? bounds.max
                  : null;
          if (next === null) return;
          event.preventDefault();
          onWidthChange(clampTutorWidth(next, bounds.min, bounds.max));
        }}
      />
      <div className="learn-study-assistant-main">
        {panel === "chat" && <header className="learn-study-assistant-header">
          <h2>学习助手</h2>
          <div>
            <button
              className="learn-assistant-icon-button"
              aria-label="新开导师对话"
              title="新开对话"
              disabled={busy || chatBusy}
              onClick={() => void connect(true)}
            >
              <Plus size={17} />
            </button>
            <button
              className="learn-tutor-expand"
              onClick={onToggleExpand}
              aria-expanded={expanded}
            >
              {expanded ? "返回课程" : "展开助手"}
            </button>
          </div>
        </header>}
        {tabs.map(({ id }) => (
          <section
            key={id}
            hidden={panel !== id}
            id={`learn-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`learn-tool-${id}`}
            className={`learn-study-pane ${id === "chat" ? "is-chat" : "is-practice"}`}
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
                    <TutorConversation />
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

const tutorPresetQuestions = [
  {
    label: "这节课最该掌握什么？",
    prompt: "请结合本课学习目标，用通俗的话概括这节课最重要的知识点，并说明为什么重要。",
  },
  {
    label: "能换个实际例子讲吗？",
    prompt: "请用一个不同于课文示例的生活或工作场景，一步步解释这节课的核心概念。",
  },
  {
    label: "能出一道题考考我吗？",
    prompt: "请根据这节课出一道能检验理解的小题，先不要给答案，等我回答后再讲解。",
  },
];

export function TutorConversation() {
  const binding = useChatComposer();
  const session = useChatSession();
  const snapshot = useChatSnapshot();
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node))
        setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [modelMenuOpen]);
  const send = async (preset?: string) => {
    if (binding.disabled || (!preset && !binding.canSubmit)) return;
    setError("");
    try {
      const result = preset
        ? await session.send({ text: preset })
        : await binding.submit();
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
        ) : (
          <div className="learn-study-welcome">
            <Sparkles size={23} />
            <h3>一起弄懂这一课</h3>
            <p>先抓住重点，再用例子理解，最后试着回答一道题。</p>
            {tutorPresetQuestions.map(({ label, prompt }) => (
              <button
                key={label}
                type="button"
                disabled={binding.disabled}
                onClick={() => void send(prompt)}
              >
                {label}
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`learn-study-compose-area ${modelMenuOpen ? "is-popover-open" : ""}`}>
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
        <form
          className="learn-study-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            rows={3}
            aria-label="给学习助手的消息"
            placeholder="问不懂的地方，或说说你的理解…"
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
              onClick={() => setModelMenuOpen((open) => !open)}
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
