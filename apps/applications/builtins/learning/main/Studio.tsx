import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import type { Brief, Course } from "./course";
import { Notice, Text, errorText } from "./components";
import { LessonEditor } from "./LessonEditor";
import { LegacyStudio, clearLegacyDraft } from "./LegacyStudio";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import {
  type Draft,
  type Outline,
  type Task,
  newDraft,
  validateDraft,
  writeDraft,
  draftKey,
  legacyDraftKey,
  authorProfile,
  outlinePrompt,
  lessonPrompt,
  acceptTask,
  finishDraft,
  editDraftLesson,
} from "./workflow";

const defaults: Brief = { topic: "", level: "零基础", count: 3, material: "" };
const storage = () => getApplicationDataClient().storage;
export async function clearGenerationDraft() {
  await storage().removeItem(draftKey);
}
export function Studio({
  onSave,
  onSaved,
  initialCourse,
}: {
  onSave: (course: Course) => Promise<void>;
  onSaved: (course: Course) => void;
  initialCourse?: Course;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [brief, setBrief] = useState<Brief>(defaults);
  const [busy, setBusy] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const lock = useRef(false);
  const load = async () => {
    setBusy(true);
    setError("");
    setReadFailed(false);
    try {
      const saved = await storage().getItem(draftKey);
      if (saved) setDraft(validateDraft(saved));
      else if (initialCourse) {
        const d = newDraft(
          {
            topic: initialCourse.title,
            level: initialCourse.level,
            count: Math.max(3, initialCourse.lessons.length),
            material: "",
          },
          initialCourse,
        );
        setDraft(await writeDraft(storage(), d));
      }
      setLegacy(!!(await storage().getItem(legacyDraftKey)));
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
    setDraft(await writeDraft(storage(), next));
  };
  const startTask = async (kind: Task["kind"], targetId?: string) => {
    if (!draft) return;
    const ref = await createModelTask(authorProfile);
    try {
      await persist({
        ...draft,
        task: { kind, ...(targetId ? { targetId } : {}), ref },
      });
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const updateOutline = (outline: Outline) => {
    if (draft) setDraft({ ...draft, outline });
  };
  const reset = async () => {
    if (draft?.task) await closeModelTask(draft.task.ref);
    await clearGenerationDraft();
    setDraft(null);
    setConfirmReset(false);
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
  if (showLegacy)
    return (
      <>
        <button className="learn-button" onClick={() => setShowLegacy(false)}>
          返回新版工坊
        </button>
        <LegacyStudio
          onSave={async (course) => {
            await onSave(course);
            await clearLegacyDraft();
            onSaved(course);
          }}
        />
      </>
    );
  return (
    <section className="learn-studio">
      <div className="learn-page-heading">
        <div>
          <span className="learn-eyebrow">COURSE STUDIO</span>
          <h1>让好奇，成为一条学习路线</h1>
          <p>先确认大纲，再逐课生成。每一步都可以调整与重试。</p>
        </div>
        <span className="learn-chip">课程工坊 · 分课生成</span>
      </div>
      {error && <Notice>{error}</Notice>}
      {readFailed ? (
        <button className="learn-button" onClick={() => void load()}>
          重试读取草稿
        </button>
      ) : (
        <>
          {legacy && (
            <p className="learn-notice warning">
              发现旧版生成记录，原记录仍保留。
              <button
                className="learn-inline-button"
                onClick={() => setShowLegacy(true)}
              >
                继续旧版生成
              </button>
            </p>
          )}
          {initialCourse && draft && draft.courseId !== initialCourse.id && (
            <Notice>
              已有另一门课程的草稿。请先完成或放弃该草稿，再从课程页进入编辑。
            </Notice>
          )}
          {!draft ? (
            <form
              className="learn-brief"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => persist(newDraft(brief)));
              }}
            >
              <label htmlFor="learning-topic">你想学什么？</label>
              <input
                id="learning-topic"
                required
                maxLength={200}
                value={brief.topic}
                onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
                placeholder="例如：从零理解机器学习"
              />
              <div className="learn-fields">
                <div>
                  <label htmlFor="learning-level">当前水平</label>
                  <select
                    id="learning-level"
                    value={brief.level}
                    onChange={(e) =>
                      setBrief({ ...brief, level: e.target.value })
                    }
                  >
                    {["零基础", "了解一些", "希望进阶"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="learning-count">计划课时</label>
                  <select
                    id="learning-count"
                    value={brief.count}
                    onChange={(e) =>
                      setBrief({ ...brief, count: Number(e.target.value) })
                    }
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} 个课时
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label htmlFor="learning-material">
                参考资料 · 选填，最多 20,000 字
              </label>
              <textarea
                id="learning-material"
                rows={7}
                maxLength={20000}
                value={brief.material}
                onChange={(e) =>
                  setBrief({ ...brief, material: e.target.value })
                }
              />
              <label className="learn-file-button">
                导入 TXT / Markdown
                <input
                  type="file"
                  accept=".txt,.md,.markdown"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void run(async () => {
                        if (
                          !/\.(txt|md|markdown)$/i.test(file.name) ||
                          file.size > 80000
                        )
                          throw new Error(
                            "请选择不超过 80 KB 的 TXT / Markdown 文件",
                          );
                        const material = await file.text();
                        if (
                          material.length > 20000 ||
                          material.includes("\u0000")
                        )
                          throw new Error(
                            "请使用不超过 20,000 字的 UTF-8 文本资料",
                          );
                        setBrief((current) => ({ ...current, material }));
                      });
                  }}
                />
              </label>
              <p className="learn-muted">
                生成时，需求与参考资料会发送给所选模型。草稿保存在本应用中。
              </p>
              <button className="learn-button primary" disabled={busy}>
                保存需求，开始规划
              </button>
            </form>
          ) : (
            <>
              <div className="learn-section-title">
                <h2>{draft.brief.topic}</h2>
                <span className="learn-chip">{draft.brief.level}</span>
              </div>
              {!draft.outline && !draft.task && (
                <button
                  className="learn-button primary"
                  disabled={busy}
                  onClick={() => void run(() => startTask("outline"))}
                >
                  准备生成大纲
                </button>
              )}
              {draft.outline && (
                <div className="learn-outline-editor">
                  <fieldset disabled={busy || !!draft.task}>
                    <legend>编辑课程大纲</legend>
                    <p className="learn-muted">
                      修改已生成课时的标题或目标会清除该课草稿内容，需要重新生成。正式课程在点击「保存课程」前不会改变。
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
                            <strong>第 {i + 1} 课</strong>
                            <span
                              className={`learn-chip ${slot.lesson ? "success" : ""}`}
                            >
                              {slot.lesson ? "内容已保存" : "待生成"}
                            </span>
                          </div>
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
                          </div>
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
                        className="learn-button"
                        disabled={
                          busy || draft.outline.lessons.every((s) => s.lesson)
                        }
                        onClick={() =>
                          void run(() =>
                            startTask(
                              "lesson",
                              draft.outline!.lessons.find((s) => !s.lesson)!.id,
                            ),
                          )
                        }
                      >
                        生成下一个待完成课时
                      </button>
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
                            await clearGenerationDraft();
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
                        : "生成单课内容"
                    }
                    prompt={
                      draft.task.kind === "outline"
                        ? outlinePrompt(draft.brief)
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
                      return (
                        <>
                          <h3>{lesson.title}</h3>
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
                        startTask(draft.task!.kind, draft.task!.targetId),
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
                内容请结合可靠资料核对。重新生成只在采用结果后替换草稿；保存课程后，被替换课时的旧测验和完成状态不再沿用。
              </p>
              <button
                className="learn-button text"
                disabled={busy}
                onClick={() => setConfirmReset(true)}
              >
                放弃此草稿，重新开始
              </button>
              {confirmReset && (
                <Notice>
                  只删除生成草稿，已保存的课程与聊天历史保留。
                  <button
                    className="learn-button danger"
                    disabled={busy}
                    onClick={() => void run(reset)}
                  >
                    确认放弃草稿
                  </button>
                  <button
                    className="learn-button"
                    onClick={() => setConfirmReset(false)}
                  >
                    继续编辑
                  </button>
                </Notice>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
