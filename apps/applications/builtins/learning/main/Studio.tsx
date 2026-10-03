import { useEffect, useRef, useState } from "react";
import { Icon, Notice, Text, errorText } from "./components";
import { LessonEditor } from "./LessonEditor";
import { RichLesson } from "./RichLesson";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import {
  type Draft,
  type Outline,
  type Slot,
  type Task,
  type CourseEntry,
  newDraft,
  validateDraft,
  authorProfile,
  outlinePrompt,
  lessonPrompt,
  revisionPrompt,
  acceptTask,
  validateOutline,
  editDraftLesson,
  addDraftLesson,
} from "./workflow";

export function Studio({
  onSaveDraft,
  onDraftChange,
  onBusyChange,
  onLessonContextChange,
  initialCourse,
  stage,
}: {
  onSaveDraft: (draft: Draft) => Promise<Draft>;
  onDraftChange: (draft: Draft) => void;
  onBusyChange: (busy: boolean) => void;
  onLessonContextChange?: (
    value: { id: string; title: string; objective: string; creating: boolean; value?: unknown; section?: string } | null,
  ) => void;
  initialCourse: CourseEntry;
  stage: "outline" | "lessons";
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState("");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [creatingSlotId, setCreatingSlotId] = useState<string | null>(null);
  const [outlineForm, setOutlineForm] = useState<Outline | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
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
        material: "",
      },
      initialCourse.status === "ready" ? initialCourse : undefined,
    );
  const load = async () => {
    setBusy(true);
    setError("");
    setReadFailed(false);
    try {
      const next =
        initialCourse.status === "stashed"
          ? validateDraft(initialCourse)
          : originalCourseDraft();
      setWorkingCourse(next);
      if (next.task?.kind === "outline")
        setOutlineForm(next.outline ?? seedOutline(next));
      if (next.task?.creating) setCreatingSlotId(next.task.targetId ?? null);
      else if (next.task && next.task.kind !== "outline")
        setEditingSlot(next.task.targetId ?? null);
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
    onBusyChangeRef.current(
      busy || !!editingSlot || !!creatingSlotId || !!outlineForm,
    );
  }, [busy, editingSlot, creatingSlotId, outlineForm]);
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
    source?: Draft,
    creating = false,
  ) => {
    const current = source ?? draft;
    if (!current) return;
    if (kind === "revise" && (!instruction?.trim() || instruction.length > 500))
      throw new Error("请填写 1–500 字的修改要求");
    const ref = await createModelTask(authorProfile);
    try {
      await persist({
        ...current,
        task: {
          kind,
          ...(targetId ? { targetId } : {}),
          ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
          ...(creating ? { creating: true as const } : {}),
          ref,
        },
      });
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
  const openOutlineEditor = () => {
    if (!draft) return;
    setError("");
    setOutlineForm(draft.outline ?? seedOutline(draft));
  };
  const closeOutlineEditor = () => {
    setError("");
    setOutlineForm(null);
  };
  const preparedOutline = () => {
    if (!draft || !outlineForm) throw new Error("课程大纲尚未填写");
    const lessons = draft.outline?.lessons ?? [];
    return {
      ...validateOutline({
        ...outlineForm,
        title: draft.brief.topic,
        level: draft.brief.level,
        lessons,
      }),
      lessons,
    };
  };
  const saveOutline = () =>
    run(async () => {
      if (!draft) return;
      await persist({ ...draft, outline: preparedOutline() });
      closeOutlineEditor();
    });
  const startOutlineAI = () =>
    run(async () => {
      if (!draft) return;
      const outline = preparedOutline();
      await startTask("outline", undefined, undefined, { ...draft, outline });
      setOutlineForm(outline);
    });
  const addSlot = () => {
    if (!draft?.outline || draft.outline.lessons.length >= 8) return;
    setError("");
    setCreatingSlotId(crypto.randomUUID());
  };
  const moveSlot = (index: number, offset: -1 | 1) => {
    if (!draft?.outline) return;
    const lessons = [...draft.outline.lessons];
    [lessons[index], lessons[index + offset]] = [
      lessons[index + offset],
      lessons[index],
    ];
    updateOutline({ ...draft.outline, lessons });
    setConfirmRemoveId(null);
  };
  const removeSlot = (id: string) => {
    if (!draft?.outline) return;
    const lessons = draft.outline.lessons.filter((slot) => slot.id !== id);
    updateOutline({ ...draft.outline, lessons });
    setConfirmRemoveId(null);
  };
  const edited: Slot | undefined =
    draft?.outline?.lessons.find(
      (slot) => slot.id === (creatingSlotId ?? editingSlot),
    ) ??
    (creatingSlotId
      ? { id: creatingSlotId, title: "", objective: "" }
      : undefined);
  useEffect(() => {
    // The mounted form reports its complete snapshot; do not overwrite it with slot metadata.
    if (!edited) onLessonContextChange?.(null);
    return () => onLessonContextChange?.(null);
  }, [
    edited?.id,
    onLessonContextChange,
  ]);
  const visibleSlots =
    draft?.outline?.lessons.filter(
      (slot) => !draft.task?.creating || slot.id !== draft.task.targetId,
    ) ?? [];
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
              ? outlinePrompt(draft.brief, draft.outline)
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
                  <h4>课程目标</h4>
                  <p>{next.outline!.goal}</p>
                  <h4>学习路径</h4>
                  <ol>
                    {next.outline!.phases.map((phase, index) => (
                      <li key={index}>
                        {phase.title}：{phase.summary}
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
                  "blocks",
                  "experiment",
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
                {lesson.blocks ? <RichLesson blocks={lesson.blocks} /> : <Text value={lesson.content} />}
                {lesson.experiment && <p>动手实验：{lesson.experiment.task}</p>}
                <h4>示例</h4>
                <Text value={lesson.example} />
                <p>{lesson.questions.length} 道测验题 · 采用后可继续查看</p>
              </>
            );
          }}
          onAccept={(raw) =>
            exclusive(async () => {
              const next = acceptTask(draft, raw);
              await persist(next);
              if (draft.task?.kind === "outline") setOutlineForm(next.outline);
              if (draft.task?.creating) {
                setEditingSlot(draft.task.targetId ?? null);
                setCreatingSlotId(null);
              }
            })
          }
          onRetryConnection={() =>
            exclusive(() =>
              startTask(
                draft.task!.kind,
                draft.task!.targetId,
                draft.task!.instruction,
                undefined,
                draft.task!.creating === true,
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
            const outline = draft.outline;
            await persist({
              ...draft,
              task: undefined,
              ...(draft.task?.creating && outline
                ? {
                    outline: {
                      ...outline,
                      lessons: outline.lessons.filter(
                        (slot) => slot.id !== draft.task!.targetId,
                      ),
                    },
                  }
                : {}),
            });
          })
        }
      >
        结束当前 AI 任务
      </button>
    </>
  ) : null;
  const closeLessonEditor = () => {
    if (busy || draft?.task) return;
    setError("");
    setEditingSlot(null);
    setCreatingSlotId(null);
  };
  const editModal =
    edited && draft ? (
      <LessonEditModal
        title={creatingSlotId ? "添加课时" : edited.title}
        creating={!!creatingSlotId}
        busy={busy || !!draft.task}
        onCancel={closeLessonEditor}
      >
        {error && <Notice>{error}</Notice>}
        <div className="learn-lesson-task-pane" hidden={!draft.task}>
          {draft.task && taskPanel}
        </div>
        <div className="learn-lesson-editor-pane" hidden={!!draft.task}>
          <LessonEditor
            key={`${edited.id}:${edited.lesson?.id ?? "empty"}`}
            lesson={edited.lesson}
            title={edited.title}
            objective={edited.objective}
            onCancel={closeLessonEditor}
            onValueChange={({ title, objective, value, section }) =>
              onLessonContextChange?.({
                id: edited.id,
                title,
                objective,
                creating: !!creatingSlotId,
                value,
                section,
              })
            }
            onSave={(value) =>
              exclusive(async () => {
                await persist(
                  creatingSlotId
                    ? addDraftLesson(draft, value, creatingSlotId)
                    : editDraftLesson(draft, edited.id, value),
                );
                setEditingSlot(null);
                setCreatingSlotId(null);
              })
            }
          />
        </div>
      </LessonEditModal>
    ) : null;
  return (
    <section
      className={`learn-studio ${stage === "lessons" ? "is-lesson-workspace" : ""}`}
    >
      {error && !outlineForm && !editingSlot && !creatingSlotId && (
        <Notice>{error}</Notice>
      )}
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
              <span className="learn-eyebrow">02 · 课程大纲</span>
              <h2>课程大纲</h2>
            </div>
          </div>
          {!draft.outline && (
            <div className="learn-outline-empty">
              <h3>规划课程目标与学习路径</h3>
              <div className="learn-actions">
                <button
                  className="learn-button primary"
                  disabled={busy || !!draft.task}
                  onClick={openOutlineEditor}
                >
                  创建大纲
                </button>
              </div>
            </div>
          )}
          {draft.outline && (
            <div className="learn-outline-readonly">
              <div className="learn-syllabus-top">
                <div>
                  <h3>{draft.outline.title}</h3>
                  <p>{draft.outline.description}</p>
                </div>
                <button
                  className="learn-button"
                  disabled={busy || !!draft.task}
                  onClick={openOutlineEditor}
                >
                  编辑大纲
                </button>
              </div>
              <section className="learn-syllabus-section">
                <h4>课程目标</h4>
                <p>{draft.outline.goal}</p>
              </section>
              <section className="learn-syllabus-section">
                <h4>学习路径</h4>
                <ol className="learn-outline-preview-list">
                  {draft.outline.phases.map((phase, index) => (
                    <li key={index}>
                      <span className="learn-outline-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{phase.title}</strong>
                        <p>{phase.summary}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
          {outlineForm && (
            <OutlineEditModal
              busy={busy || !!draft.task}
              onCancel={closeOutlineEditor}
            >
              <header className="learn-outline-modal-header">
                <div>
                  <span className="learn-eyebrow">课程大纲</span>
                  <h2>{draft.outline ? "编辑课程大纲" : "创建课程大纲"}</h2>
                  <p>{draft.brief.topic}</p>
                </div>
                <button
                  className="learn-button text"
                  aria-label="关闭大纲编辑"
                  disabled={busy || !!draft.task}
                  onClick={closeOutlineEditor}
                >
                  ×
                </button>
              </header>
              {error && <Notice>{error}</Notice>}
              <div className="learn-outline-modal-body">
                {draft.task?.kind === "outline" ? (
                  taskPanel
                ) : (
                  <>
                    <div className="learn-outline-ai-row">
                      <div>
                        <strong>AI 辅助规划</strong>
                        <p>以当前填写的内容为基础生成或优化，预览后再采用。</p>
                      </div>
                      <button
                        className="learn-button"
                        disabled={busy}
                        onClick={() => void startOutlineAI()}
                      >
                        {draft.outline ? "AI 优化大纲" : "AI 生成大纲"}
                      </button>
                    </div>
                    <div className="learn-outline-form-fields">
                      <label>
                        课程简介
                        <textarea
                          rows={3}
                          maxLength={1000}
                          value={outlineForm.description}
                          onChange={(event) =>
                            setOutlineForm({
                              ...outlineForm,
                              description: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        课程目标
                        <textarea
                          rows={3}
                          maxLength={1000}
                          value={outlineForm.goal}
                          onChange={(event) =>
                            setOutlineForm({
                              ...outlineForm,
                              goal: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="learn-outline-phase-heading">
                        <h3>学习路径</h3>
                        <button
                          className="learn-button compact"
                          disabled={outlineForm.phases.length >= 6}
                          onClick={() =>
                            setOutlineForm({
                              ...outlineForm,
                              phases: [
                                ...outlineForm.phases,
                                { title: "", summary: "" },
                              ],
                            })
                          }
                        >
                          添加阶段
                        </button>
                      </div>
                      <ol className="learn-outline-phase-fields">
                        {outlineForm.phases.map((phase, index) => (
                          <li key={index}>
                            <span className="learn-outline-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <input
                                aria-label={`第 ${index + 1} 阶段名称`}
                                placeholder="阶段名称"
                                maxLength={120}
                                value={phase.title}
                                onChange={(event) =>
                                  setOutlineForm({
                                    ...outlineForm,
                                    phases: outlineForm.phases.map((item, i) =>
                                      i === index
                                        ? { ...item, title: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <textarea
                                aria-label={`第 ${index + 1} 阶段说明`}
                                placeholder="本阶段的学习方向"
                                rows={2}
                                maxLength={500}
                                value={phase.summary}
                                onChange={(event) =>
                                  setOutlineForm({
                                    ...outlineForm,
                                    phases: outlineForm.phases.map((item, i) =>
                                      i === index
                                        ? {
                                            ...item,
                                            summary: event.target.value,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <button
                              className="learn-button text"
                              aria-label={`移除第 ${index + 1} 阶段`}
                              disabled={outlineForm.phases.length <= 1}
                              onClick={() =>
                                setOutlineForm({
                                  ...outlineForm,
                                  phases: outlineForm.phases.filter(
                                    (_, i) => i !== index,
                                  ),
                                })
                              }
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </>
                )}
              </div>
              {!draft.task && (
                <footer className="learn-outline-modal-footer">
                  <button
                    className="learn-button"
                    disabled={busy}
                    onClick={closeOutlineEditor}
                  >
                    取消
                  </button>
                  <button
                    className="learn-button primary"
                    disabled={busy}
                    onClick={() => void saveOutline()}
                  >
                    保存大纲
                  </button>
                </footer>
              )}
            </OutlineEditModal>
          )}
        </div>
      ) : (
        <div className="learn-lesson-workspace">
          <div className="learn-lesson-rail">
            <div className="learn-lesson-rail-header">
              <div>
                <span className="learn-eyebrow">03 · 课时内容</span>
                <h2>课时内容</h2>
              </div>
              <div className="learn-lesson-toolbar">
                <span className="learn-chip">
                  共 {visibleSlots.length} 课时
                </span>
                <button
                  className="learn-button compact"
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
            </div>
            <ol className="learn-lesson-cards">
              {!visibleSlots.length && (
                <li className="learn-lesson-empty">
                  还没有课时。点击「添加课时」开始。
                </li>
              )}
              {visibleSlots.map((slot, index) => (
                <li key={slot.id}>
                  <button
                    className="learn-lesson-card"
                    disabled={busy || !!draft.task}
                    onClick={() => {
                      setError("");
                      setConfirmRemoveId(null);
                      setEditingSlot(slot.id);
                    }}
                  >
                    <span className="learn-lesson-card-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="learn-lesson-card-info">
                      <strong>{slot.title}</strong>
                      <small>{slot.objective}</small>
                    </span>
                  </button>
                  <div className="learn-lesson-card-actions">
                    <button
                      type="button"
                      aria-label={`上移第 ${index + 1} 课`}
                      title={`上移第 ${index + 1} 课`}
                      disabled={busy || !!draft.task || index === 0}
                      onClick={() => moveSlot(index, -1)}
                    >
                      <Icon name="chevronUp" size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`下移第 ${index + 1} 课`}
                      title={`下移第 ${index + 1} 课`}
                      disabled={
                        busy ||
                        !!draft.task ||
                        index === visibleSlots.length - 1
                      }
                      onClick={() => moveSlot(index, 1)}
                    >
                      <Icon name="chevronDown" size={18} />
                    </button>
                    <button
                      type="button"
                      className="learn-lesson-remove"
                      data-confirming={confirmRemoveId === slot.id}
                      aria-label={`${confirmRemoveId === slot.id ? "确认移除" : "移除"}第 ${index + 1} 课`}
                      title={`${confirmRemoveId === slot.id ? "确认移除" : "移除"}第 ${index + 1} 课`}
                      disabled={busy || !!draft.task}
                      onClick={() =>
                        confirmRemoveId === slot.id
                          ? removeSlot(slot.id)
                          : setConfirmRemoveId(slot.id)
                      }
                    >
                      <Icon name={confirmRemoveId === slot.id ? "check" : "trash"} size={17} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {editModal}
    </section>
  );
}

function seedOutline(draft: Draft): Outline {
  return {
    title: draft.brief.topic,
    description: `围绕${draft.brief.topic}逐步学习并完成练习。`,
    level: draft.brief.level,
    goal: `掌握${draft.brief.topic}的核心知识，并能用于实际问题。`,
    phases: [
      {
        title: "建立基础",
        summary: `理解${draft.brief.topic}的基本概念与方法。`,
      },
      { title: "实践应用", summary: "通过练习和案例运用所学知识。" },
    ],
    lessons: [],
  };
}

function OutlineEditModal({
  busy,
  onCancel,
  children,
}: {
  busy: boolean;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("textarea")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="learn-outline-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="learn-outline-dialog"
        role="dialog"
        aria-modal="false"
        aria-label="课程大纲编辑"
        ref={dialog}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !busy) onCancel();
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)",
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

function LessonEditModal({
  title,
  creating,
  busy,
  onCancel,
  children,
}: {
  title: string;
  creating: boolean;
  busy: boolean;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLElement>(
        ".learn-lesson-basics input, .learn-lesson-task-pane:not([hidden]) button",
      )
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
        aria-modal="false"
        aria-label={creating ? "添加课时" : `编辑课时：${title}`}
        ref={dialog}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onCancel();
        }}
      >
        <header className="learn-lesson-modal-header">
          <div>
            <span className="learn-eyebrow">{creating ? "添加课时" : "编辑课时"}</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="learn-button text"
            aria-label="关闭课时编辑"
            disabled={busy}
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
