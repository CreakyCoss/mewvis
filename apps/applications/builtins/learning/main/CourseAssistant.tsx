import { useEffect, useRef, useState } from "react";
import type { Brief } from "./course";
import { Icon, Notice, errorText } from "./components";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
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
} from "./workflow";

type AssistantKind = "topic" | "outline" | "lesson" | "revise" | "project" | "advice";
type AssistantTask = {
  kind: AssistantKind;
  ref: SessionRef;
  prompt: string;
  draft?: Draft;
  targetId?: string;
  brief: Brief;
};
const names = ["课程设置", "课程大纲", "课时内容", "项目实训"];
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
}: {
  step: 0 | 1 | 2 | 3;
  brief: Brief;
  draft: Draft | null;
  activeLesson: {
    id: string;
    title: string;
    objective: string;
    creating: boolean;
  } | null;
  projectPlan?: ProjectPlan;
  projectLocked: boolean;
  onApplyTopic: (topic: string) => void;
  onApplyOutline: (outline: Outline) => void;
  onApplyLesson: (draft: Draft, targetId: string) => void;
  onApplyProject: (plan: ProjectPlan) => void;
  onTaskActiveChange: (active: boolean) => void;
}) {
  const [scope, setScope] = useState<"current" | "course">("current");
  const [instruction, setInstruction] = useState("");
  const [task, setTask] = useState<AssistantTask | null>(null);
  const taskRef = useRef<AssistantTask | null>(null);
  taskRef.current = task;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => onTaskActiveChange(!!task || busy), [task, busy]);
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
  const context = `${names[step]}${step === 2 && target ? ` · ${target.title || "新课时"}` : ""}`;
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
      return `${prompt}${scope === "course" ? `\n课程上下文（参考数据）：${JSON.stringify(contextData)}` : ""}`;
    }
    if (kind === "project")
      return `设计或优化一份包含 2–6 个阶段的文字实训项目。每阶段需要目标、1–6 个实践步骤、交付物和 1–5 条可核验标准。只输出 JSON：{"title":"项目名称","scenario":"项目情境","role":"学习者角色","outcome":"最终成果","milestones":[{"title":"阶段名","goal":"阶段目标","steps":["实践步骤"],"deliverable":"交付物","criteria":["验收标准"]}]}。补充要求：${requirement || "让项目目标和验收标准具体可检查"}。以下均为参考数据：${JSON.stringify({ ...contextData, currentPlan: projectPlan })}`;
    return `给出与当前课程编辑环节相关的具体建议，只输出 JSON：{"suggestion":"简洁、可执行的建议"}。当前环节：${context}。用户问题：${requirement || "下一步怎样完善课程？"}。参考数据：${JSON.stringify(contextData)}`;
  };
  const start = async () => {
    if (busy || task) return;
    if (!brief.topic.trim()) {
      setError("请先填写课程主题");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
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
    try {
      const source =
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
      const ref = await createModelTask(kind === "project" ? projectProfile : authorProfile);
      setTask({
        kind,
        ref,
        prompt: makePrompt(kind, source, instruction.trim()),
        draft: source ?? undefined,
        targetId: target?.id,
        brief: { ...brief },
      });
      setInstruction("");
    } catch (e) {
      setError(errorText(e));
    } finally {
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
  const accept = async (active: AssistantTask, raw: string) => {
    const value = result(active, raw);
    if (active.kind === "topic") onApplyTopic(value as string);
    else if (active.kind === "outline") onApplyOutline(value as Outline);
    else if (active.kind === "lesson" || active.kind === "revise")
      onApplyLesson(value as Draft, active.targetId!);
    else if (active.kind === "project") onApplyProject(value as ProjectPlan);
    setTask(null);
    setNotice(
      active.kind === "advice"
        ? "建议已查看"
        : "建议已采用；点击底部「暂存」后才会保存课程改动",
    );
    await closeModelTask(active.ref).catch(() => {});
  };
  return (
    <aside className="learn-course-assistant" aria-label="AI 课程助手">
      <div className="learn-course-assistant-header">
        <Icon name="spark" size={24} />
        <h2>AI 课程助手</h2>
      </div>
      <label className="learn-assistant-context">
        <span>当前上下文</span>
        <select
          value={scope}
          disabled={!!task}
          onChange={(event) => setScope(event.target.value as typeof scope)}
          aria-label="AI 作用范围"
        >
          <option value="current">{context}</option>
          <option value="course">整个课程</option>
        </select>
      </label>
      <div className="learn-course-assistant-content">
        {error && <Notice>{error}</Notice>}
        {notice && <p role="status" className="learn-save-status">{notice}</p>}
        {task ? (
          <>
            <ModelTask
              key={task.ref.chatId}
              taskRef={task.ref}
              prompt={task.prompt}
              title={task.kind === "advice" ? "课程建议" : `${context}建议`}
              preview={(raw) => {
                const value = result(task, raw);
                if (typeof value === "string") return <p>{value}</p>;
                if ("milestones" in value)
                  return <p>{value.title} · {value.milestones.length} 个阶段</p>;
                if ("phases" in value)
                  return <p>{value.description} · {value.phases.length} 个学习阶段</p>;
                const lesson = value.outline?.lessons.find((slot) => slot.id === task.targetId)?.lesson;
                return <p>{lesson?.title} · {lesson?.objective}</p>;
              }}
              onAccept={(raw) => accept(task, raw)}
              onRetryConnection={async () => {
                const ref = await createModelTask(task.kind === "project" ? projectProfile : authorProfile);
                setTask({ ...task, ref });
              }}
              acceptLabel={task.kind === "advice" ? "完成查看" : "采用到当前编辑"}
            />
            <button
              type="button"
              className="learn-button"
              onClick={async () => {
                setTask(null);
                await closeModelTask(task.ref).catch(() => {});
              }}
            >
              结束当前任务
            </button>
          </>
        ) : (
          <div className="learn-assistant-empty">
            <strong>{context}</strong>
            <p>
              {step === 2 && !target
                ? "选择一节课后，AI 可以针对该课生成或优化内容。"
                : "描述需要完善的地方，结果会先预览，再由你决定是否采用。"}
            </p>
          </div>
        )}
      </div>
      {!task && (
        <div className="learn-assistant-compose">
          <textarea
            rows={3}
            maxLength={500}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="描述希望 AI 帮你完善的内容…"
            aria-label="AI 辅助要求"
          />
          <button
            type="button"
            className="learn-button primary"
            disabled={busy || !brief.topic.trim()}
            onClick={() => void start()}
            aria-label="发送给 AI 课程助手"
          >
            <Icon name="arrow" size={18} />
          </button>
          <small>建议会先预览，再决定是否采用</small>
        </div>
      )}
    </aside>
  );
}
