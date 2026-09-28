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
  draftKeyForCourse,
  legacyDraftKey,
  authorProfile,
  outlinePrompt,
  lessonPrompt,
  revisionPrompt,
  acceptTask,
  finishDraft,
  editDraftLesson,
} from "./workflow";

const defaults: Brief = { topic: "", level: "零基础", count: 3, material: "" };
const storage = () => getApplicationDataClient().storage;
export async function clearGenerationDraft(key = draftKey) {
  await storage().removeItem(key);
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
  const [revisionSlot, setRevisionSlot] = useState<string | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const lock = useRef(false);
  const activeDraftKey = initialCourse
    ? draftKeyForCourse(initialCourse.id)
    : draftKey;
  const load = async () => {
    setBusy(true);
    setError("");
    setReadFailed(false);
    try {
      let saved = await storage().getItem(activeDraftKey);
      if (!saved && initialCourse) {
        const previous = await storage().getItem(draftKey);
        if (previous && validateDraft(previous).courseId === initialCourse.id) {
          saved = previous;
          await storage().setItem(activeDraftKey, previous);
          await storage().removeItem(draftKey);
        }
      }
      if (saved) {
        const restored = validateDraft(saved);
        if (initialCourse && restored.courseId !== initialCourse.id)
          throw new Error("编辑草稿与当前课程不匹配，原始记录已保留");
        setDraft(restored);
      } else if (initialCourse) {
        const d = newDraft(
          {
            topic: initialCourse.title,
            level: initialCourse.level,
            count: Math.max(3, initialCourse.lessons.length),
            material: "",
          },
          initialCourse,
        );
        setDraft(await writeDraft(storage(), d, activeDraftKey));
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
    setDraft(await writeDraft(storage(), next, activeDraftKey));
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
    if (draft) setDraft({ ...draft, outline });
  };
  const reset = async () => {
    if (draft?.task) await closeModelTask(draft.task.ref);
    await clearGenerationDraft(activeDraftKey);
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
          <h1>{initialCourse ? "编辑课程" : "创建课程"}</h1>
          <p>确定目标、确认大纲、逐课准备内容，然后开始学习。</p>
        </div>
        <span className="learn-chip">草稿自动保留已采用的内容</span>
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
          {!draft ? (
            <form
              className="learn-brief"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => persist(newDraft(brief)));
              }}
            >
              <div className="learn-brief-intro">
                <span className="learn-eyebrow">STEP 01 · 学习需求</span>
                <h2>这门课想帮你学会什么？</h2>
                <p>先写主题和当前水平，再决定是否提供参考资料。</p>
              </div>
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
              <details
                className="learn-material-details"
                open={!!brief.material}
              >
                <summary>
                  添加参考资料（选填）
                  <small>粘贴文字或追加 TXT / Markdown</small>
                </summary>
                <div>
                  <label htmlFor="learning-material">
                    参考资料 · 选填，最多 20,000 字
                  </label>
                  <textarea
                    id="learning-material"
                    rows={7}
                    maxLength={20000}
                    disabled={busy}
                    value={brief.material}
                    onChange={(e) =>
                      setBrief({ ...brief, material: e.target.value })
                    }
                  />
                  <label className="learn-file-button">
                    追加 TXT / Markdown 资料
                    <input
                      type="file"
                      accept=".txt,.md,.markdown"
                      multiple
                      disabled={busy}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (files.length)
                          void run(async () => {
                            if (files.length > 5)
                              throw new Error("每次最多导入 5 个资料文件");
                            const sections = await Promise.all(
                              files.map(async (file) => {
                                if (
                                  !/\.(txt|md|markdown)$/i.test(file.name) ||
                                  file.size > 80000
                                )
                                  throw new Error(
                                    "请选择不超过 80 KB 的 TXT / Markdown 文件",
                                  );
                                let content: string;
                                try {
                                  content = new TextDecoder("utf-8", {
                                    fatal: true,
                                  }).decode(await file.arrayBuffer());
                                } catch {
                                  throw new Error(
                                    `${file.name} 不是有效的 UTF-8 文本资料`,
                                  );
                                }
                                if (content.includes("\u0000"))
                                  throw new Error(
                                    `${file.name} 不是有效的 UTF-8 文本资料`,
                                  );
                                const name = file.name
                                  .replace(/[\r\n\t]/g, " ")
                                  .slice(0, 120);
                                return `【来源：${name}】\n${content.trim()}`;
                              }),
                            );
                            const material = [
                              brief.material.trim(),
                              ...sections,
                            ]
                              .filter(Boolean)
                              .join("\n\n");
                            if (material.length > 20000)
                              throw new Error(
                                "参考资料总长度不能超过 20,000 字",
                              );
                            setBrief((current) => ({ ...current, material }));
                          });
                      }}
                    />
                  </label>
                </div>
              </details>
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
                            await clearGenerationDraft(activeDraftKey);
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
                              。采用后只更新这一课的草稿。
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
