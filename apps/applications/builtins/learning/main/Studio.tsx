import { useEffect, useRef, useState } from "react";
import type { Course } from "./course";
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
  finishDraft,
  editDraftLesson,
} from "./workflow";

export function Studio({
  onSave,
  onSaveDraft,
  onSaved,
  onStashed,
  onDraftChange,
  initialCourse,
}: {
  onSave: (course: Course) => Promise<void>;
  onSaveDraft: (draft: Draft) => Promise<Draft>;
  onSaved: (course: Course) => void;
  onStashed: () => void;
  onDraftChange: (draft: Draft) => void;
  initialCourse: CourseEntry;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState("");
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [revisionSlot, setRevisionSlot] = useState<string | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const lock = useRef(false);
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
    setWorkingCourse(await onSaveDraft(next));
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
      setRevisionSlot(null);
      setRevisionInstruction("");
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const updateOutline = (outline: Outline) => {
    if (draft) setWorkingCourse({ ...draft, outline });
  };
  const edited = draft?.outline?.lessons.find((s) => s.id === editingSlot);
  if (edited && draft)
    return (
      <LessonEditor
        key={edited.id}
        lesson={edited.lesson}
        title={edited.title}
        objective={edited.objective}
        onCancel={() => setEditingSlot(null)}
        onSave={(value) =>
          exclusive(async () => {
            await persist(editDraftLesson(draft, edited.id, value));
            setEditingSlot(null);
          })
        }
      />
    );
  const prepared =
    draft?.outline?.lessons.filter((slot) => slot.lesson).length ?? 0;
  const stage = !draft
    ? 0
    : !draft.outline
      ? 1
      : prepared < draft.outline.lessons.length
        ? 2
        : 3;
  return (
    <section className="learn-studio">
      <div className="learn-page-heading">
        <div>
          <span className="learn-eyebrow">COURSE STUDIO</span>
          <h1>编辑课程</h1>
          <p>确定目标、确认大纲、逐课准备内容，然后开始学习。</p>
        </div>
        <span className="learn-chip">可暂存并从首页继续编辑</span>
      </div>
      <ol className="learn-studio-steps" aria-label="课程制作阶段">
        {(["学习需求", "课程大纲", "课时内容", "保存课程"] as const).map(
          (label, index) => (
            <li
              key={label}
              className={
                index === stage ? "active" : index < stage ? "done" : ""
              }
              aria-current={index === stage ? "step" : undefined}
            >
              <span>{index < stage ? "✓" : index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {draft && !readFailed && (
        <div className="learn-actions">
          <button
            className="learn-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await persist(draft);
                onStashed();
              })
            }
          >
            暂存并返回首页
          </button>
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      {readFailed ? (
        <button className="learn-button" onClick={() => void load()}>
          重试读取课程
        </button>
      ) : (
        <>
          {!draft ? (
            <p role="status" className="learn-muted">
              正在读取课程…
            </p>
          ) : (
            <>
              <div className="learn-section-title">
                <h2>{draft.brief.topic}</h2>
                <span className="learn-chip">{draft.brief.level}</span>
              </div>
              {!draft.outline && !draft.task && (
                <div className="learn-next-step">
                  <div>
                    <span className="learn-eyebrow">STEP 02 · 课程大纲</span>
                    <h3>学习需求已保存</h3>
                    <p>先生成课程结构，再检查每课标题和目标。</p>
                  </div>
                  <button
                    className="learn-button primary"
                    disabled={busy}
                    onClick={() => void run(() => startTask("outline"))}
                  >
                    准备生成大纲
                  </button>
                </div>
              )}
              {draft.outline &&
                !draft.task &&
                draft.outline.lessons.some((slot) => !slot.lesson) && (
                  <div className="learn-current-task">
                    <div>
                      <span className="learn-eyebrow">当前任务</span>
                      <strong>
                        生成第{" "}
                        {draft.outline.lessons.findIndex(
                          (slot) => !slot.lesson,
                        ) + 1}{" "}
                        课：
                        {
                          draft.outline.lessons.find((slot) => !slot.lesson)
                            ?.title
                        }
                      </strong>
                      <p>生成后先预览并采用，再继续下一课。</p>
                    </div>
                    <button
                      className="learn-button primary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          startTask(
                            "lesson",
                            draft.outline!.lessons.find((slot) => !slot.lesson)!
                              .id,
                          ),
                        )
                      }
                    >
                      生成下一个待完成课时
                    </button>
                  </div>
                )}
              {draft.outline && (
                <div className="learn-outline-editor">
                  <fieldset disabled={busy || !!draft.task}>
                    <legend>课程结构</legend>
                    <p className="learn-muted">
                      修改已生成课时的标题或目标会清除该课内容，需要重新生成。完成全部课时后可保存课程。
                    </p>
                    <label>
                      课程名称
                      <input
                        maxLength={120}
                        value={draft.outline.title}
                        onChange={(e) =>
                          updateOutline({
                            ...draft.outline!,
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      课程简介
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={draft.outline.description}
                        onChange={(e) =>
                          updateOutline({
                            ...draft.outline!,
                            description: e.target.value,
                          })
                        }
                      />
                    </label>
                    <ol className="learn-slot-list">
                      {draft.outline.lessons.map((slot, i) => (
                        <li key={slot.id}>
                          <div className="learn-section-title">
                            <strong>
                              第 {i + 1} 课 · {slot.title}
                            </strong>
                            <span
                              className={`learn-chip ${slot.lesson ? "success" : ""}`}
                            >
                              {slot.lesson ? "内容已保存" : "待生成"}
                            </span>
                          </div>
                          <details className="learn-slot-details">
                            <summary>编辑标题与目标</summary>
                            <label>
                              课时标题
                              <input
                                maxLength={120}
                                value={slot.title}
                                onChange={(e) =>
                                  updateOutline({
                                    ...draft.outline!,
                                    lessons: draft.outline!.lessons.map((s) =>
                                      s.id === slot.id
                                        ? {
                                            id: s.id,
                                            title: e.target.value,
                                            objective: s.objective,
                                          }
                                        : s,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              学习目标
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={slot.objective}
                                onChange={(e) =>
                                  updateOutline({
                                    ...draft.outline!,
                                    lessons: draft.outline!.lessons.map((s) =>
                                      s.id === slot.id
                                        ? {
                                            id: s.id,
                                            title: s.title,
                                            objective: e.target.value,
                                          }
                                        : s,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </details>
                          <div className="learn-actions">
                            <div>
                              <button
                                className="learn-button text"
                                disabled={i === 0}
                                onClick={() => {
                                  const lessons = [...draft.outline!.lessons];
                                  [lessons[i - 1], lessons[i]] = [
                                    lessons[i],
                                    lessons[i - 1],
                                  ];
                                  updateOutline({ ...draft.outline!, lessons });
                                }}
                              >
                                上移
                              </button>
                              <button
                                className="learn-button text"
                                disabled={
                                  i === draft.outline!.lessons.length - 1
                                }
                                onClick={() => {
                                  const lessons = [...draft.outline!.lessons];
                                  [lessons[i + 1], lessons[i]] = [
                                    lessons[i],
                                    lessons[i + 1],
                                  ];
                                  updateOutline({ ...draft.outline!, lessons });
                                }}
                              >
                                下移
                              </button>
                              <button
                                className="learn-button text"
                                disabled={draft.outline!.lessons.length <= 1}
                                onClick={() =>
                                  updateOutline({
                                    ...draft.outline!,
                                    lessons: draft.outline!.lessons.filter(
                                      (s) => s.id !== slot.id,
                                    ),
                                  })
                                }
                              >
                                移除课时
                              </button>
                            </div>
                            <button
                              className="learn-button"
                              onClick={() =>
                                void run(() => startTask("lesson", slot.id))
                              }
                            >
                              {slot.lesson ? "重新生成本课" : "生成本课"}
                            </button>
                            <button
                              className="learn-button"
                              onClick={() => setEditingSlot(slot.id)}
                            >
                              手动编辑内容
                            </button>
                            {slot.lesson && (
                              <button
                                className="learn-button"
                                onClick={() => {
                                  setRevisionSlot(slot.id);
                                  setRevisionInstruction("");
                                }}
                              >
                                AI 局部修改
                              </button>
                            )}
                          </div>
                          {revisionSlot === slot.id && slot.lesson && (
                            <div className="learn-revision-form">
                              <label>
                                描述希望修改的部分
                                <textarea
                                  rows={3}
                                  maxLength={500}
                                  value={revisionInstruction}
                                  placeholder="例如：把示例换成真实业务场景，并补一道相关练习题"
                                  onChange={(e) =>
                                    setRevisionInstruction(e.target.value)
                                  }
                                />
                              </label>
                              <div className="learn-actions">
                                <button
                                  className="learn-button primary"
                                  disabled={busy || !revisionInstruction.trim()}
                                  onClick={() =>
                                    void run(() =>
                                      startTask(
                                        "revise",
                                        slot.id,
                                        revisionInstruction,
                                      ),
                                    )
                                  }
                                >
                                  准备 AI 修改
                                </button>
                                <button
                                  className="learn-button"
                                  onClick={() => setRevisionSlot(null)}
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}
                          {slot.lesson && (
                            <details>
                              <summary>预览讲解与测验</summary>
                              <Text value={slot.lesson.content} />
                              <Text value={slot.lesson.example} />
                              <ul>
                                {slot.lesson.takeaways.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                              {slot.lesson.questions.map((q) => (
                                <p key={q.id}>
                                  {q.question} ·{" "}
                                  {q.type === "short_answer"
                                    ? "简答"
                                    : q.type === "multiple_choice"
                                      ? "多选"
                                      : "单选"}
                                </p>
                              ))}
                            </details>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="learn-actions">
                      <button
                        className="learn-button"
                        disabled={draft.outline.lessons.length >= 8}
                        onClick={() =>
                          updateOutline({
                            ...draft.outline!,
                            lessons: [
                              ...draft.outline!.lessons,
                              {
                                id: crypto.randomUUID(),
                                title: "新课时",
                                objective: "填写本课学习目标",
                              },
                            ],
                          })
                        }
                      >
                        添加课时
                      </button>
                      <button
                        className="learn-button"
                        onClick={() => void run(() => persist(draft))}
                      >
                        保存大纲修改
                      </button>
                    </div>
                  </fieldset>
                  <p className="learn-muted">
                    {draft.outline.lessons.filter((s) => s.lesson).length} /{" "}
                    {draft.outline.lessons.length} 课时已准备 ·
                    大纲修改需点击保存，开始生成时也会一并保存。
                  </p>
                  {!draft.task && (
                    <div className="learn-actions">
                      <button
                        className="learn-button primary"
                        disabled={
                          busy || draft.outline.lessons.some((s) => !s.lesson)
                        }
                        onClick={() =>
                          void run(async () => {
                            await persist(draft);
                            const course = finishDraft(draft);
                            await onSave(course);
                            onSaved(course);
                          })
                        }
                      >
                        保存课程，开始学习
                      </button>
                    </div>
                  )}
                </div>
              )}
              {draft.task && (
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
                            <ol>
                              {next.outline!.lessons.map((s) => (
                                <li key={s.id}>
                                  {s.title}：{s.objective}
                                </li>
                              ))}
                            </ol>
                          </>
                        );
                      const lesson = next.outline!.lessons.find(
                        (s) => s.id === draft.task!.targetId,
                      )!.lesson!;
                      const previous = draft.outline?.lessons.find(
                        (s) => s.id === draft.task!.targetId,
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
                              JSON.stringify(
                                lesson[field as keyof typeof lesson],
                              ) !==
                              JSON.stringify(
                                previous[field as keyof typeof previous],
                              ),
                          )
                        : [];
                      return (
                        <>
                          <h3>{lesson.title}</h3>
                          {draft.task!.kind === "revise" && (
                            <p>
                              本次修改：{changed.join("、")}
                              。采用后只更新这一课的内容。
                            </p>
                          )}
                          <Text value={lesson.content} />
                          <h4>示例</h4>
                          <Text value={lesson.example} />
                          <p>
                            {lesson.questions.length} 道测验题 ·
                            采用后可继续查看
                          </p>
                        </>
                      );
                    }}
                    onAccept={(raw) =>
                      exclusive(() => persist(acceptTask(draft, raw)))
                    }
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
              )}
              {draft.task && (
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
                  结束当前任务，返回大纲
                </button>
              )}
              <p className="learn-muted">
                AI
                内容请结合可靠资料核对。重新生成只在采用结果后替换课程内容；保存课程后，被替换课时的旧测验和完成状态不再沿用。
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
