import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
  type ApplicationModelOption,
} from "@mewvis/app-sdk/chat";
import type { Brief } from "./course";
import { Icon, Notice, errorText } from "./components";
import { createModelTask, closeModelTask, openModelTask } from "./ModelTask";
import { finalText } from "./generation";
import {
  type AssistantOutcome,
  type AssistantPreviewSummary,
  type AssistantTurn,
} from "./assistantHistory";
import { type ProjectPlan, validatePlan, projectProfile } from "./pbl";
import {
  type Draft,
  type Outline,
  type Slot,
  type SessionRef,
  authorProfile,
  outlinePrompt,
  lessonPrompt,
  revisionPrompt,
  acceptTask,
  parseJSON,
  validateOutline,
  draftWithLessonForm,
  assertUnchangedLessonForm,
} from "./workflow";

type AssistantKind = "topic" | "outline" | "lesson" | "revise" | "project" | "advice";
type AssistantTask = {
  kind: AssistantKind;
  ref: SessionRef;
  prompt: string;
  request: string;
  context: string;
  session: ApplicationChatSession;
  draft?: Draft;
  targetId?: string;
  brief: Brief;
  editorValue?: string;
};
type AssistantResult = string | Outline | Draft | ProjectPlan;
const noTaskSnapshot = () => null;
const noTaskSubscription = () => () => {};
const names = ["课程设置", "课程大纲", "课时内容", "项目实训"];
const defaultRequests: Record<AssistantKind, string> = {
  topic: "优化课程主题",
  outline: "完善课程大纲",
  lesson: "生成完整课时",
  revise: "优化当前课时",
  project: "设计项目实训",
  advice: "给我一些课程建议",
};
const suggestions = [
  ["让课程主题更清晰", "明确适合的学习起点"],
  ["完善学习目标", "优化学习路径"],
  ["检查课时安排", "给出教学内容建议"],
  ["设计实训项目", "细化验收标准"],
];
const parsed = (raw: string) => {
  const value = parseJSON(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI 结果格式无效");
  return value as Record<string, unknown>;
};
const resultText = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}需为 1–${max} 字`);
  return value.trim();
};
const summarizeResult = (task: AssistantTask, value: AssistantResult): AssistantPreviewSummary => {
  if (typeof value === "string") return { body: value };
  if ("milestones" in value)
    return { title: value.title, body: value.scenario, detail: `${value.milestones.length} 个实践阶段` };
  if ("phases" in value)
    return {
      title: value.goal,
      body: value.description,
      items: value.phases.map((phase) => phase.title),
    };
  const lesson = value.outline?.lessons.find((slot) => slot.id === task.targetId)?.lesson;
  return lesson
    ? {
        title: lesson.title,
        body: lesson.objective,
        detail: `${lesson.content.slice(0, 180)}${lesson.content.length > 180 ? "…" : ""}`,
      }
    : { body: "课时结果已生成" };
};

export function CourseAssistant({
  step,
  brief,
  draft,
  activeLesson,
  projectPlan,
  projectLocked,
  onApplyTopic,
  onApplyOutline,
  onApplyLesson,
  onApplyProject,
  onTaskActiveChange,
  initialHistory,
  onHistoryChange,
}: {
  step: 0 | 1 | 2 | 3;
  brief: Brief;
  draft: Draft | null;
  activeLesson: {
    id: string;
    title: string;
    objective: string;
    creating: boolean;
    value?: unknown;
    section?: string;
  } | null;
  projectPlan?: ProjectPlan;
  projectLocked: boolean;
  onApplyTopic: (topic: string) => void;
  onApplyOutline: (outline: Outline) => void;
  onApplyLesson: (draft: Draft, targetId: string) => void;
  onApplyProject: (plan: ProjectPlan) => void;
  onTaskActiveChange: (active: boolean) => void;
  initialHistory: AssistantTurn[];
  onHistoryChange: (history: AssistantTurn[]) => void;
}) {
  const [scope, setScope] = useState<"current" | "course">("current");
  const [instruction, setInstruction] = useState("");
  const [models, setModels] = useState<ApplicationModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const [task, setTask] = useState<AssistantTask | null>(null);
  const [history, setHistory] = useState<AssistantTurn[]>(initialHistory);
  const contentRef = useRef<HTMLDivElement>(null);
  const startLock = useRef(false);
  const finishLock = useRef(false);
  const taskSnapshot = useSyncExternalStore(
    task?.session.subscribe ?? noTaskSubscription,
    task?.session.getSnapshot ?? noTaskSnapshot,
  );
  const taskRef = useRef<AssistantTask | null>(null);
  taskRef.current = task;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => onTaskActiveChange(!!task || busy), [task, busy]);
  useEffect(() => onHistoryChange(history), [history]);
  useEffect(() => {
    const panel = contentRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [history.length, task?.request, taskSnapshot?.phase]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const available = await getApplicationChatClient().listModels();
        if (!alive) return;
        setModels(available);
        setSelectedModelId((current) => current || available[0]?.id || "");
      } catch {
        // Some preview hosts provide a default model through the session only.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [modelMenuOpen]);
  useEffect(
    () => () => {
      if (taskRef.current)
        void closeModelTask(taskRef.current.ref).catch(() => {});
    },
    [],
  );
  const target: Slot | undefined = activeLesson
    ? draft?.outline?.lessons.find((slot) => slot.id === activeLesson.id) ?? {
        id: activeLesson.id,
        title: activeLesson.title,
        objective: activeLesson.objective,
      }
    : undefined;
  const context = `${names[step]}${step === 2 && target ? ` · ${activeLesson?.title || target.title || "新课时"}${activeLesson?.section ? ` · ${activeLesson.section}` : ""}` : ""}`;
  const makePrompt = (kind: AssistantKind, source: Draft | null, requirement: string) => {
    const contextData = {
      topic: brief.topic,
      level: brief.level,
      ...(scope === "course"
        ? {
            outline: source?.outline && {
              description: source.outline.description,
              goal: source.outline.goal,
              phases: source.outline.phases,
              lessons: source.outline.lessons.map((slot) => ({
                title: slot.title,
                objective: slot.objective,
              })),
            },
            projectPlan,
          }
        : {}),
    };
    if (kind === "topic")
      return `根据课程主题、水平和参考资料，建议一个清晰的课程主题。只输出 JSON：{"topic":"建议的主题"}。补充要求：${requirement || "改进课程主题的清晰度"}。参考数据：${JSON.stringify({ ...contextData, material: brief.material })}`;
    if (kind === "outline")
      return `${outlinePrompt(brief, source?.outline)}\n补充要求：${requirement || "完善课程级大纲，不涉及课时"}${scope === "course" ? `\n课程上下文（参考数据）：${JSON.stringify(contextData)}` : ""}`;
    if ((kind === "lesson" || kind === "revise") && source && target) {
      const withTask: Draft = {
        ...source,
        task: {
          kind,
          targetId: target.id,
          instruction: requirement || (kind === "revise" ? "优化本课的表达和测验" : "生成完整课时"),
          ref: { workspaceId: "pending", chatId: "pending" },
        },
      };
      const prompt = kind === "revise"
        ? revisionPrompt(withTask, target.id)
        : lessonPrompt(withTask, target.id);
      return `${prompt}\n当前编辑区域（参考数据）：${activeLesson?.section ?? "课时内容"}${kind === "lesson" && activeLesson?.value ? `\n当前未完成表单（参考数据，请沿用已填写内容）：${JSON.stringify(activeLesson.value)}` : ""}${scope === "course" ? `\n课程上下文（参考数据）：${JSON.stringify(contextData)}` : ""}`;
    }
    if (kind === "project")
      return `设计或优化一份包含 2–6 个阶段的文字实训项目。每阶段需要目标、1–6 个实践步骤、交付物和 1–5 条可核验标准。只输出 JSON：{"title":"项目名称","scenario":"项目情境","role":"学习者角色","outcome":"最终成果","milestones":[{"title":"阶段名","goal":"阶段目标","steps":["实践步骤"],"deliverable":"交付物","criteria":["验收标准"]}]}。补充要求：${requirement || "让项目目标和验收标准具体可检查"}。以下均为参考数据：${JSON.stringify({ ...contextData, currentPlan: projectPlan })}`;
    return `给出与当前课程编辑环节相关的具体建议，只输出 JSON：{"suggestion":"简洁、可执行的建议"}。当前环节：${context}。用户问题：${requirement || "下一步怎样完善课程？"}。参考数据：${JSON.stringify(contextData)}`;
  };
  const start = async (suggestion?: string) => {
    if (busy || task || startLock.current) return;
    if (!brief.topic.trim()) {
      setError("请先填写课程主题");
      return;
    }
    startLock.current = true;
    const request = suggestion ?? instruction.trim();
    setBusy(true);
    setError("");
    const kind: AssistantKind =
      step === 0
        ? "topic"
        : step === 1
          ? "outline"
          : step === 3
            ? projectLocked ? "advice" : "project"
            : target
              ? target.lesson
                ? "revise"
                : "lesson"
              : "advice";
    let ref: SessionRef | null = null;
    try {
      let source =
        kind === "lesson" &&
        activeLesson?.creating &&
        draft?.outline &&
        target
          ? {
              ...draft,
              outline: {
                ...draft.outline,
                lessons: [
                  ...draft.outline.lessons,
                  {
                    id: target.id,
                    title:
                      target.title.trim() ||
                      `第 ${draft.outline.lessons.length + 1} 课`,
                    objective: target.objective.trim() || "填写本课学习目标",
                  },
                ],
              },
            }
          : draft;
      if (kind === "revise" && source && activeLesson?.value && target)
        source = draftWithLessonForm(source, target.id, activeLesson.value);
      ref = await createModelTask(kind === "project" ? projectProfile : authorProfile);
      const session = await openModelTask(ref);
      if (selectedModelId && session.getSnapshot().config.selectedModelId !== selectedModelId) {
        const updated = await session.updateConfig({ selectedModelId });
        if (!updated.ok) throw new Error(updated.error);
      }
      const prompt = makePrompt(kind, source, request);
      const sent = await session.send({ text: prompt, requestId: crypto.randomUUID() });
      if (sent.status !== "dispatched")
        throw new Error(sent.reason || "AI 任务未启动，请重试");
      setTask({
        kind,
        ref,
        prompt,
        request: request || defaultRequests[kind],
        context,
        session,
        draft: source ?? undefined,
        targetId: target?.id,
        brief: { ...brief },
        editorValue: activeLesson?.value ? JSON.stringify(activeLesson.value) : undefined,
      });
      setInstruction("");
    } catch (e) {
      setError(errorText(e));
      if (ref) void closeModelTask(ref).catch(() => {});
    } finally {
      startLock.current = false;
      setBusy(false);
    }
  };
  const sendAgain = async (active: AssistantTask, prompt: string, request: string) => {
    if (busy || startLock.current || active.session.getSnapshot().phase !== "idle") return;
    startLock.current = true;
    const previous = archiveTurn(active, prompt === active.prompt ? "retried" : "revised");
    setBusy(true);
    setError("");
    try {
      if (selectedModelId && active.session.getSnapshot().config.selectedModelId !== selectedModelId) {
        const updated = await active.session.updateConfig({ selectedModelId });
        if (!updated.ok) throw new Error(updated.error);
      }
      const sent = await active.session.send({ text: prompt, requestId: crypto.randomUUID() });
      if (sent.status !== "dispatched")
        throw new Error(sent.reason || "AI 任务未启动，请重试");
      setHistory((current) => [...current, previous]);
      setTask({ ...active, prompt, request });
      setInstruction("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      startLock.current = false;
      setBusy(false);
    }
  };
  const refine = () => {
    if (!task || !instruction.trim()) return;
    const request = instruction.trim();
    void sendAgain(
      task,
      `请按以下新要求修改上一轮结果，完整输出符合上一轮格式和字段约束的 JSON，不要附加解释。新要求：${request}`,
      request,
    );
  };
  const discard = async (active: AssistantTask) => {
    if (finishLock.current) return;
    finishLock.current = true;
    setBusy(true);
    try {
      const archived = archiveTurn(active, "discarded");
      setHistory((current) => [...current, archived]);
      setTask(null);
      setError("");
      await closeModelTask(active.ref).catch(() => {});
    } finally {
      finishLock.current = false;
      setBusy(false);
    }
  };
  const result = (active: AssistantTask, raw: string) => {
    if (active.kind === "topic")
      return resultText(parsed(raw).topic, "建议主题", 200);
    if (active.kind === "outline") {
      const source = active.draft;
      const generated = validateOutline({
        ...parsed(raw),
        title: active.brief.topic,
        level: active.brief.level,
        lessons: [],
      });
      return { ...generated, lessons: source?.outline?.lessons ?? [] };
    }
    if (active.kind === "lesson" || active.kind === "revise") {
      if (!active.draft || !active.targetId) throw new Error("目标课时不存在");
      return acceptTask(
        {
          ...active.draft,
          task: {
            kind: active.kind,
            targetId: active.targetId,
            instruction: "AI 辅助",
            ref: active.ref,
          },
        },
        raw,
      );
    }
    if (active.kind === "project") return validatePlan(parsed(raw));
    return resultText(parsed(raw).suggestion, "建议", 3000);
  };
  function archiveTurn(active: AssistantTask, outcome: AssistantOutcome): AssistantTurn {
    const snapshot = active.session.getSnapshot();
    const raw = finalText(snapshot);
    let preview: AssistantPreviewSummary | undefined;
    let failure = snapshot.error || snapshot.initializationError || "";
    if (raw !== null) {
      try {
        preview = summarizeResult(active, result(active, raw));
      } catch (e) {
        failure = errorText(e);
      }
    }
    return {
      id: crypto.randomUUID(),
      context: active.context,
      request: active.request,
      outcome,
      ...(preview ? { preview } : {}),
      ...(failure ? { error: failure.slice(0, 500) } : {}),
    };
  }
  const accept = async (active: AssistantTask, raw: string) => {
    if (finishLock.current) return;
    finishLock.current = true;
    setBusy(true);
    try {
      if (active.kind === "lesson" || active.kind === "revise")
        assertUnchangedLessonForm(active.editorValue, activeLesson && activeLesson.id === active.targetId ? activeLesson.value : undefined);
      const value = result(active, raw);
      if (active.kind === "topic") onApplyTopic(value as string);
      else if (active.kind === "outline") onApplyOutline(value as Outline);
      else if (active.kind === "lesson" || active.kind === "revise")
        onApplyLesson(value as Draft, active.targetId!);
      else if (active.kind === "project") onApplyProject(value as ProjectPlan);
      const archived = archiveTurn(active, active.kind === "advice" ? "viewed" : "accepted");
      setHistory((current) => [...current, archived]);
      setTask(null);
      setError("");
      await closeModelTask(active.ref).catch(() => {});
    } catch (e) {
      setError(errorText(e));
    } finally {
      finishLock.current = false;
      setBusy(false);
    }
  };
  const selectedModelName = models.find((model) => model.id === selectedModelId)?.modelName ?? "选择模型";
  return (
    <aside className="learn-course-assistant" aria-label="AI 课程助手">
      <div className="learn-course-assistant-top">
        <div className="learn-course-assistant-header">
          <Icon name="spark" size={20} />
          <h2>AI 课程助手</h2>
        </div>
      </div>
      <div className="learn-assistant-scope" role="group" aria-label="AI 作用范围">
        <span>作用范围</span>
        <div className="learn-assistant-scope-options">
          <button
            type="button"
            aria-pressed={scope === "current"}
            title={`当前内容：${context}`}
            disabled={!!task}
            onClick={() => setScope("current")}
          >
            当前内容
          </button>
          <button
            type="button"
            aria-pressed={scope === "course"}
            disabled={!!task}
            onClick={() => setScope("course")}
          >
            整个课程
          </button>
        </div>
      </div>
      <div className="learn-course-assistant-content" ref={contentRef}>
        {step === 2 && target && <p className="learn-assistant-editing-context">{activeLesson?.title || target.title} · {activeLesson?.section || "课时内容"}</p>}
        {error && <Notice>{error}</Notice>}
        {history.length > 0 || task ? (
          <div className="learn-assistant-thread" role="log" aria-label="AI 对话记录">
            {history.map((turn) => <AssistantHistoryTurn key={turn.id} turn={turn} />)}
            {task && (
              <AssistantTaskView
                task={task}
                busy={busy}
                resolve={result}
                onAccept={(raw) => void accept(task, raw)}
                onRetry={() => void sendAgain(task, task.prompt, task.request)}
                onStop={() => void task.session.stop().then((stopped) => {
                  if (!stopped.ok) setError(stopped.error);
                }).catch((e) => setError(errorText(e)))}
                onDiscard={() => void discard(task)}
              />
            )}
          </div>
        ) : !instruction.trim() ? (
          <div className="learn-assistant-empty">
            <div className="learn-assistant-suggestions">
              {suggestions[step].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy || !brief.topic.trim()}
                  onClick={() => void start(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
        <div className="learn-assistant-compose">
          <div className="learn-assistant-input">
            <textarea
              rows={3}
              maxLength={500}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={busy || (!!task && taskSnapshot?.phase !== "idle")}
              placeholder={task ? "继续描述想调整的地方…" : "描述希望 AI 帮你完善的内容…"}
              aria-label="AI 辅助要求"
            />
            {models.length > 0 && (
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
                  disabled={busy}
                  aria-label={`AI 助手模型：${selectedModelName}`}
                  aria-expanded={modelMenuOpen}
                  title={selectedModelName}
                  onClick={() => setModelMenuOpen((open) => !open)}
                >
                  <span>{selectedModelName}</span>
                  <Icon name="chevronDown" size={15} />
                </button>
                {modelMenuOpen && (
                  <div className="learn-assistant-model-menu" role="group" aria-label="可用 AI 模型">
                    {models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        aria-pressed={model.id === selectedModelId}
                        onClick={() => {
                          setSelectedModelId(model.id);
                          setModelMenuOpen(false);
                          modelTriggerRef.current?.focus();
                        }}
                      >
                        <span>{model.modelName}</span>
                        {model.id === selectedModelId && <Icon name="check" size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="learn-button primary learn-assistant-send"
              disabled={busy || !brief.topic.trim() || (!!task && (!instruction.trim() || taskSnapshot?.phase !== "idle"))}
              onClick={task ? refine : () => void start()}
              aria-label={task ? "发送调整要求给 AI 课程助手" : "发送给 AI 课程助手"}
              title={task ? "继续调整" : "发送并生成"}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
    </aside>
  );
}

const outcomeLabels: Record<AssistantOutcome, string> = {
  accepted: "已采纳",
  viewed: "已查看",
  discarded: "已放弃",
  revised: "已继续调整",
  retried: "已重新生成",
};
function AssistantHistoryTurn({ turn }: { turn: AssistantTurn }) {
  return (
    <div className="learn-assistant-flow learn-assistant-history-turn">
      <div className="learn-assistant-request">
        <span>{turn.context}</span>
        <p>{turn.request}</p>
      </div>
      <section className="learn-assistant-response" aria-label="历史 AI 结果">
        <div className="learn-assistant-response-heading">
          <span className="learn-assistant-outcome" data-outcome={turn.outcome}>
            {turn.outcome === "accepted" && <Icon name="check" size={13} />}
            {outcomeLabels[turn.outcome]}
          </span>
        </div>
        {turn.preview && (
          <div className="learn-assistant-result">
            <span>结果预览</span>
            <AssistantPreview preview={turn.preview} />
          </div>
        )}
        {turn.error && <p className="learn-assistant-response-note">{turn.error}</p>}
      </section>
    </div>
  );
}

function AssistantTaskView({
  task,
  busy,
  resolve,
  onAccept,
  onRetry,
  onStop,
  onDiscard,
}: {
  task: AssistantTask;
  busy: boolean;
  resolve: (task: AssistantTask, raw: string) => AssistantResult;
  onAccept: (raw: string) => void;
  onRetry: () => void;
  onStop: () => void;
  onDiscard: () => void;
}) {
  const snapshot = useSyncExternalStore(task.session.subscribe, task.session.getSnapshot);
  const raw = finalText(snapshot);
  let value: AssistantResult | null = null;
  let validation = "";
  if (raw !== null) {
    try {
      value = resolve(task, raw);
    } catch (e) {
      validation = errorText(e);
    }
  }
  const generating = snapshot.phase !== "idle" && snapshot.phase !== "closed";
  const stopped = snapshot.execution?.state === "cancelled";
  const problem = snapshot.error || snapshot.initializationError || validation;
  const status = generating
    ? "正在生成"
    : value !== null
      ? "结果已就绪"
      : stopped
        ? "已停止生成"
        : "生成未完成";
  return (
    <div className="learn-assistant-flow">
      <div className="learn-assistant-request">
        <span>{task.context}</span>
        <p>{task.request}</p>
      </div>
      <section className="learn-assistant-response" aria-label="AI 生成结果">
        <div className="learn-assistant-response-heading">
          <span className="learn-assistant-status-dot" data-active={generating} />
          <strong role="status">{status}</strong>
        </div>
        {generating && (
          <p className="learn-assistant-response-note">
            正在根据你的要求整理建议…
          </p>
        )}
        {problem && <Notice>{problem}</Notice>}
        {stopped && !problem && (
          <p className="learn-assistant-response-note">可以重试生成，也可以放弃本次结果。</p>
        )}
        {value !== null && (
          <div className="learn-assistant-result">
            <span>结果预览</span>
            <AssistantPreview preview={summarizeResult(task, value)} />
          </div>
        )}
        <div className="learn-assistant-response-actions">
          {generating ? (
            <button type="button" className="learn-button compact" disabled={busy} onClick={onStop}>
              停止生成
            </button>
          ) : (
            <>
              {value !== null && (
                <button type="button" className="learn-button primary compact" disabled={busy} onClick={() => {
                  if (raw !== null) onAccept(raw);
                }}>
                  {task.kind === "advice" ? "完成查看" : "采用到当前编辑"}
                </button>
              )}
              <button type="button" className="learn-button compact" disabled={busy} onClick={onRetry}>
                {value !== null ? "重新生成" : "重试生成"}
              </button>
              <button type="button" className="learn-button text compact" disabled={busy} onClick={onDiscard}>
                放弃
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function AssistantPreview({ preview }: { preview: AssistantPreviewSummary }) {
  return (
    <div>
      {preview.title && <strong>{preview.title}</strong>}
      <p>{preview.body}</p>
      {preview.detail && <small>{preview.detail}</small>}
      {preview.items && <ol>{preview.items.map((item, index) => <li key={index}>{item}</li>)}</ol>}
    </div>
  );
}
