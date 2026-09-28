import { useEffect, useRef, useState } from "react";
import { Notice, Text, errorText } from "./components";
import { LessonEditor } from "./LessonEditor";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import {
  type Draft,
  type Outline,
  type Task,
  type CourseEntry,
  newDraft,
  validateDraft,
  authorProfile,
  outlinePrompt,
  lessonPrompt,
  revisionPrompt,
  acceptTask,
  editDraftSlot,
  editDraftLesson,
} from "./workflow";

export function Studio({
  onSaveDraft,
  onDraftChange,
  onBusyChange,
  initialCourse,
  stage,
}: {
  onSaveDraft: (draft: Draft) => Promise<Draft>;
  onDraftChange: (draft: Draft) => void;
  onBusyChange: (busy: boolean) => void;
  initialCourse: CourseEntry;
  stage: "outline" | "lessons";
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState("");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const lock = useRef(false);
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const setWorkingCourse = (next: Draft) => {
    onDraftChange(next);
    setDraft(next);
  };
  const originalCourseDraft = () =>
    newDraft(
      {
        topic:
          initialCourse.status === "ready"
            ? initialCourse.title
            : initialCourse.brief.topic,
        level:
          initialCourse.status === "ready"
            ? initialCourse.level
            : initialCourse.brief.level,
        count:
          initialCourse.status === "ready"
            ? Math.max(3, initialCourse.lessons.length)
            : initialCourse.brief.count,
        material: "",
      },
      initialCourse.status === "ready" ? initialCourse : undefined,
    );
  const load = async () => {
    setBusy(true);
    setError("");
    setReadFailed(false);
    try {
      setWorkingCourse(
        initialCourse.status === "stashed"
          ? validateDraft(initialCourse)
          : originalCourseDraft(),
      );
    } catch (e) {
      setError(errorText(e));
      setReadFailed(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    onBusyChangeRef.current(busy || !!editingSlot);
  }, [busy, editingSlot]);
  useEffect(() => () => onBusyChangeRef.current(false), []);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const exclusive = async (action: () => Promise<void>) => {
    if (lock.current) throw new Error("正在保存，请稍后重试");
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const persist = async (next: Draft) => {
    setWorkingCourse(
      await onSaveDraft({ ...next, creationStep: stage === "outline" ? 1 : 2 }),
    );
  };
  const startTask = async (
    kind: Task["kind"],
    targetId?: string,
    instruction?: string,
  ) => {
    if (!draft) return;
    if (kind === "revise" && (!instruction?.trim() || instruction.length > 500))
      throw new Error("请填写 1–500 字的修改要求");
    const ref = await createModelTask(authorProfile);
    try {
      await persist({
        ...draft,
        task: {
          kind,
          ...(targetId ? { targetId } : {}),
          ...(kind === "revise" ? { instruction: instruction!.trim() } : {}),
          ref,
        },
      });
      setRevisionInstruction("");
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const updateOutline = (outline: Outline) => {
    if (draft)
      setWorkingCourse({
        ...draft,
        creationStep: stage === "outline" ? 1 : 2,
        outline,
      });
  };
  const createManualOutline = () => {
    if (!draft) return;
    updateOutline({
      title: draft.brief.topic,
      description: `围绕${draft.brief.topic}逐步学习并完成练习。`,
      level: draft.brief.level,
      lessons: Array.from({ length: draft.brief.count }, (_, i) => ({
        id: crypto.randomUUID(),
        title: `第 ${i + 1} 课`,
        objective: `填写第 ${i + 1} 课的学习目标`,
      })),
    });
  };
  const addSlot = () => {
    if (!draft?.outline || draft.outline.lessons.length >= 8) return;
    const id = crypto.randomUUID();
    updateOutline({
      ...draft.outline,
      lessons: [
        ...draft.outline.lessons,
        {
          id,
          title: `第 ${draft.outline.lessons.length + 1} 课`,
          objective: "填写本课学习目标",
        },
      ],
    });
    setSelectedSlotId(id);
    setEditingSlot(id);
  };
  const moveSlot = (index: number, offset: -1 | 1) => {
    if (!draft?.outline) return;
    const lessons = [...draft.outline.lessons];
    [lessons[index], lessons[index + offset]] = [
      lessons[index + offset],
      lessons[index],
    ];
    updateOutline({ ...draft.outline, lessons });
  };
  const removeSlot = (id: string) => {
    if (!draft?.outline || draft.outline.lessons.length <= 1) return;
    const lessons = draft.outline.lessons.filter((slot) => slot.id !== id);
    updateOutline({ ...draft.outline, lessons });
    setConfirmRemoveId(null);
    if (selectedSlotId === id) setSelectedSlotId(lessons[0].id);
  };
  const selectForAI = (id: string) => {
    setSelectedSlotId(id);
    setRevisionInstruction("");
    if (window.matchMedia("(max-width: 900px)").matches)
      requestAnimationFrame(() =>
        document.getElementById("learn-ai-assistant")?.scrollIntoView({
          block: "start",
        }),
      );
  };
  const saveSlotOutline = async (
    id: string,
    title: string,
    objective: string,
  ) => {
    if (!draft) return;
    await exclusive(async () => {
      await persist(editDraftSlot(draft, id, title, objective));
      setEditingSlot(null);
    });
  };
  const selected =
    draft?.outline?.lessons.find((slot) => slot.id === selectedSlotId) ??
    draft?.outline?.lessons.find((slot) => !slot.lesson) ??
    draft?.outline?.lessons[0];
  const edited = draft?.outline?.lessons.find(
    (slot) => slot.id === editingSlot,
  );
  const editModal =
    edited && draft ? (
      <LessonEditModal
        title={edited.title}
        onCancel={() => {
          if (!busy) setEditingSlot(null);
        }}
      >
        <LessonEditor
          key={edited.id}
          lesson={edited.lesson}
          title={edited.title}
          objective={edited.objective}
          onCancel={() => setEditingSlot(null)}
          onSaveOutline={(title, objective) =>
            saveSlotOutline(edited.id, title, objective)
          }
          onSave={(value) =>
            exclusive(async () => {
              await persist(editDraftLesson(draft, edited.id, value));
              setEditingSlot(null);
            })
          }
        />
      </LessonEditModal>
    ) : null;
  const taskPanel = draft?.task ? (
    <>
      <div inert={busy}>
        <ModelTask
          key={draft.task.ref.chatId}
          taskRef={draft.task.ref}
          title={
            draft.task.kind === "outline"
              ? "生成课程大纲"
              : draft.task.kind === "revise"
                ? "AI 局部修改课时"
                : "生成单课内容"
          }
          prompt={
            draft.task.kind === "outline"
              ? outlinePrompt(draft.brief)
              : draft.task.kind === "revise"
                ? revisionPrompt(draft, draft.task.targetId!)
                : lessonPrompt(draft, draft.task.targetId!)
          }
          preview={(raw) => {
            const next = acceptTask(draft, raw);
            if (draft.task!.kind === "outline")
              return (
                <>
                  <h3>{next.outline!.title}</h3>
                  <p>{next.outline!.description}</p>
                  <ol>
                    {next.outline!.lessons.map((slot) => (
                      <li key={slot.id}>
                        {slot.title}：{slot.objective}
                      </li>
                    ))}
                  </ol>
                </>
              );
            const lesson = next.outline!.lessons.find(
              (slot) => slot.id === draft.task!.targetId,
            )!.lesson!;
            const previous = draft.outline?.lessons.find(
              (slot) => slot.id === draft.task!.targetId,
            )?.lesson;
            const changed = previous
              ? [
                  "title",
                  "objective",
                  "content",
                  "example",
                  "takeaways",
                  "questions",
                ].filter(
                  (field) =>
                    JSON.stringify(lesson[field as keyof typeof lesson]) !==
                    JSON.stringify(previous[field as keyof typeof previous]),
                )
              : [];
            return (
              <>
                <h3>{lesson.title}</h3>
                {draft.task!.kind === "revise" && (
                  <p>
                    本次修改：{changed.join("、")}。采用后只更新这一课的内容。
                  </p>
                )}
                <Text value={lesson.content} />
                <h4>示例</h4>
                <Text value={lesson.example} />
                <p>{lesson.questions.length} 道测验题 · 采用后可继续查看</p>
              </>
            );
          }}
          onAccept={(raw) => exclusive(() => persist(acceptTask(draft, raw)))}
          onRetryConnection={() =>
            exclusive(() =>
              startTask(
                draft.task!.kind,
                draft.task!.targetId,
                draft.task!.instruction,
              ),
            )
          }
        />
      </div>
      <button
        className="learn-button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await closeModelTask(draft.task!.ref);
            await persist({ ...draft, task: undefined });
          })
        }
      >
        结束当前 AI 任务
      </button>
    </>
  ) : null;
  return (
    <section
      className={`learn-studio ${stage === "lessons" ? "is-lesson-workspace" : ""}`}
    >
      {error && <Notice>{error}</Notice>}
      {readFailed ? (
        <button className="learn-button" onClick={() => void load()}>
          重试读取课程
        </button>
      ) : !draft ? (
        <p role="status" className="learn-muted">
          正在读取课程…
        </p>
      ) : stage === "outline" ? (
        <div className="learn-outline-overview">
          <div className="learn-outline-overview-header">
            <div>
              <span className="learn-eyebrow">02 · 大纲预览</span>
              <h2>{draft.brief.topic}</h2>
              <p>大纲默认只读。课时标题、目标和顺序统一在课时工作台维护。</p>
            </div>
            <span className="learn-chip">{draft.brief.level}</span>
          </div>
          {!draft.outline && !draft.task && (
            <div className="learn-outline-empty">
              <h3>先规划课程大纲</h3>
              <p>
                可以让 AI 生成课时安排，也可以先建空白框架，在下一步逐课填写。
              </p>
              <div className="learn-actions">
                <button
                  className="learn-button"
                  disabled={busy}
                  onClick={createManualOutline}
                >
                  创建空白课时框架
                </button>
                <button
                  className="learn-button primary"
                  disabled={busy}
                  onClick={() => void run(() => startTask("outline"))}
                >
                  AI 生成大纲
                </button>
              </div>
            </div>
          )}
          {draft.outline && (
            <div className="learn-outline-readonly">
              <div className="learn-outline-summary">
                <div>
                  <span className="learn-eyebrow">课程简介</span>
                  {editingDescription ? (
                    <label>
                      <span className="learn-sr-only">课程简介</span>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={draft.outline.description}
                        onChange={(event) =>
                          updateOutline({
                            ...draft.outline!,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <p>{draft.outline.description}</p>
                  )}
                </div>
                <button
                  className="learn-button"
                  disabled={busy || !!draft.task}
                  onClick={() => setEditingDescription((value) => !value)}
                >
                  {editingDescription ? "完成简介编辑" : "编辑简介"}
                </button>
              </div>
              <ol className="learn-outline-preview-list">
                {draft.outline.lessons.map((slot, index) => (
                  <li key={slot.id}>
                    <span className="learn-outline-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{slot.title}</strong>
                      <p>{slot.objective}</p>
                    </div>
                    <span
                      className={`learn-chip ${slot.lesson ? "success" : ""}`}
                    >
                      {slot.lesson ? "已完成" : "待编写"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="learn-muted">
                {draft.outline.lessons.length} 个课时 ·
                在下一步点击课时即可编辑。
              </p>
              {!draft.outline.lessons.some((slot) => slot.lesson) &&
                !draft.task && (
                  <button
                    className="learn-button"
                    disabled={busy}
                    onClick={() => void run(() => startTask("outline"))}
                  >
                    AI 重新规划大纲
                  </button>
                )}
            </div>
          )}
          {taskPanel}
        </div>
      ) : (
        <div className="learn-lesson-workspace">
          <div className="learn-lesson-rail">
            <div className="learn-lesson-rail-header">
              <div>
                <span className="learn-eyebrow">03 · 课时工作台</span>
                <h2>课时列表</h2>
                <p>点击课时，在弹窗中编辑标题、目标、内容和测验。</p>
              </div>
              <span className="learn-chip">
                {draft.outline?.lessons.filter((slot) => slot.lesson).length ??
                  0}{" "}
                / {draft.outline?.lessons.length ?? 0} 已完成
              </span>
            </div>
            <ol className="learn-lesson-cards">
              {draft.outline?.lessons.map((slot, index) => (
                <li
                  key={slot.id}
                  className={selected?.id === slot.id ? "selected" : ""}
                >
                  <button
                    className="learn-lesson-card"
                    disabled={busy || !!draft.task}
                    onClick={() => {
                      setSelectedSlotId(slot.id);
                      setEditingSlot(slot.id);
                    }}
                  >
                    <span className="learn-lesson-card-index">
                      第 {index + 1} 课
                    </span>
                    <strong>{slot.title}</strong>
                    <span className="learn-lesson-card-objective">
                      {slot.objective}
                    </span>
                    <span
                      className={`learn-chip ${slot.lesson ? "success" : ""}`}
                    >
                      {slot.lesson ? "内容已完成" : "内容待编写"}
                    </span>
                    <span className="learn-lesson-card-edit">编辑课时 →</span>
                  </button>
                  <div className="learn-lesson-card-actions">
                    <button
                      disabled={busy || !!draft.task}
                      onClick={() => selectForAI(slot.id)}
                    >
                      交给 AI
                    </button>
                    <button
                      aria-label={`上移第 ${index + 1} 课`}
                      disabled={busy || !!draft.task || index === 0}
                      onClick={() => moveSlot(index, -1)}
                    >
                      上移
                    </button>
                    <button
                      aria-label={`下移第 ${index + 1} 课`}
                      disabled={
                        busy ||
                        !!draft.task ||
                        index === draft.outline!.lessons.length - 1
                      }
                      onClick={() => moveSlot(index, 1)}
                    >
                      下移
                    </button>
                    <button
                      aria-label={`${confirmRemoveId === slot.id ? "确认移除" : "移除"}第 ${index + 1} 课`}
                      disabled={
                        busy ||
                        !!draft.task ||
                        draft.outline!.lessons.length <= 1
                      }
                      onClick={() =>
                        confirmRemoveId === slot.id
                          ? removeSlot(slot.id)
                          : setConfirmRemoveId(slot.id)
                      }
                    >
                      {confirmRemoveId === slot.id ? "确认移除" : "移除"}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button
              className="learn-button learn-add-lesson"
              disabled={
                busy ||
                !!draft.task ||
                (draft.outline?.lessons.length ?? 0) >= 8
              }
              onClick={addSlot}
            >
              添加课时
            </button>
          </div>
          <aside
            className="learn-ai-assistant"
            id="learn-ai-assistant"
            aria-label="课程 AI 助手"
          >
            <div className="learn-ai-assistant-header">
              <span className="learn-eyebrow">AI ASSISTANT</span>
              <h2>AI 课程助手</h2>
              <p>围绕当前课时生成内容或局部修改，确认结果后再采用。</p>
            </div>
            {draft.task ? (
              taskPanel
            ) : selected ? (
              <div className="learn-ai-assistant-body">
                <label htmlFor="learn-ai-target">当前课时</label>
                <select
                  id="learn-ai-target"
                  value={selected.id}
                  onChange={(event) => {
                    setSelectedSlotId(event.target.value);
                    setRevisionInstruction("");
                  }}
                >
                  {draft.outline!.lessons.map((slot, index) => (
                    <option key={slot.id} value={slot.id}>
                      第 {index + 1} 课 · {slot.title}
                    </option>
                  ))}
                </select>
                <div className="learn-ai-context">
                  <strong>{selected.title}</strong>
                  <p>{selected.objective}</p>
                  <span
                    className={`learn-chip ${selected.lesson ? "success" : ""}`}
                  >
                    {selected.lesson ? "内容已完成" : "内容待编写"}
                  </span>
                </div>
                <button
                  className="learn-button primary learn-ai-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => startTask("lesson", selected.id))
                  }
                >
                  {selected.lesson ? "重新生成本课" : "AI 生成本课"}
                </button>
                {selected.lesson && (
                  <div className="learn-ai-revision">
                    <h3>局部修改</h3>
                    <label htmlFor="learn-revision-instruction">
                      描述希望修改的部分
                    </label>
                    <textarea
                      id="learn-revision-instruction"
                      rows={4}
                      maxLength={500}
                      value={revisionInstruction}
                      placeholder="例如：换一个更贴近实际的示例"
                      onChange={(event) =>
                        setRevisionInstruction(event.target.value)
                      }
                    />
                    <button
                      className="learn-button"
                      disabled={busy || !revisionInstruction.trim()}
                      onClick={() =>
                        void run(() =>
                          startTask("revise", selected.id, revisionInstruction),
                        )
                      }
                    >
                      准备 AI 修改
                    </button>
                  </div>
                )}
                <p className="learn-muted">
                  AI
                  内容请结合可靠资料核对。课时修改后，本课旧测验和完成状态不再沿用。
                </p>
              </div>
            ) : (
              <p className="learn-muted">请先创建课时。</p>
            )}
          </aside>
        </div>
      )}
      {editModal}
    </section>
  );
}

function LessonEditModal({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLElement>("input, textarea, button")
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="learn-lesson-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="learn-lesson-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`编辑课时：${title}`}
        ref={dialog}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onCancel();
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ) ?? [],
          );
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
