import { useEffect, useRef, useState } from "react";
import type { Brief } from "./course";
import type { Course } from "./course";
import { Icon, Notice, errorText } from "./components";
import {
  finishDraft,
  newDraft,
  validateDraft,
  type CourseEntry,
  type Draft,
} from "./workflow";
import { Studio } from "./Studio";
import { ProjectLab } from "./ProjectLab";

const initial: Brief = { topic: "", level: "零基础", count: 3, material: "" };
const labels = ["学习主题", "学习安排", "参考资料", "课程大纲", "课时内容"];
type CreationStep = 0 | 1 | 2 | 3 | 4;
const briefFromCourse = (course?: CourseEntry): Brief =>
  !course
    ? initial
    : course.status === "stashed"
      ? course.brief
      : {
          topic: course.title,
          level: course.level,
          count: Math.max(3, course.lessons.length),
          material: "",
        };

export function CourseDialog({
  onClose,
  onCreate,
  onSave,
  onSaveDraft,
  onSaved,
  onStashed,
  initialCourse,
}: {
  onClose: () => void;
  onCreate: (brief: Brief, step: CreationStep) => Promise<Draft>;
  onSave: (course: Course) => Promise<void>;
  onSaveDraft: (draft: Draft) => Promise<Draft>;
  onSaved: (course: Course) => void;
  onStashed: () => void;
  initialCourse?: CourseEntry;
}) {
  const startingStep: CreationStep = initialCourse
    ? initialCourse.status === "stashed"
      ? (initialCourse.creationStep ?? (initialCourse.outline ? 4 : 3))
      : 4
    : 0;
  const [step, setStep] = useState<CreationStep>(startingStep);
  const [maxStep, setMaxStep] = useState<CreationStep>(startingStep);
  const [pane, setPane] = useState<"content" | "project">("content");
  const [brief, setBrief] = useState<Brief>(() =>
    briefFromCourse(initialCourse),
  );
  const [created, setCreated] = useState<CourseEntry | undefined>();
  const [workingDraft, setWorkingDraft] = useState<Draft | null>(() =>
    !initialCourse
      ? null
      : initialCourse.status === "stashed"
        ? validateDraft(initialCourse)
        : newDraft(briefFromCourse(initialCourse), initialCourse),
  );
  const [busy, setBusy] = useState(false);
  const [studioBusy, setStudioBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const draftRef = useRef<Draft | null>(workingDraft);
  const currentCourse = created ?? initialCourse;
  const shownCourse = workingDraft ?? currentCourse;
  const activeBusy = busy || studioBusy;
  const complete =
    !!workingDraft?.outline &&
    !workingDraft.task &&
    workingDraft.outline.lessons.every((slot) => !!slot.lesson);
  const cleanBrief = (): Brief => ({
    ...brief,
    topic: brief.topic.trim(),
    material: brief.material.trim(),
  });
  const withBrief = (draft: Draft, targetStep: CreationStep = step): Draft => {
    const next = cleanBrief();
    const renameOutline =
      !!draft.outline &&
      next.topic !== draft.brief.topic &&
      draft.outline.title === draft.brief.topic;
    const changeLevel = !!draft.outline && next.level !== draft.brief.level;
    return {
      ...draft,
      brief: next,
      creationStep: targetStep,
      outline:
        draft.outline && (renameOutline || changeLevel)
          ? {
              ...draft.outline,
              ...(renameOutline ? { title: next.topic } : {}),
              ...(changeLevel ? { level: next.level } : {}),
            }
          : draft.outline,
    };
  };
  const saveWorkingCourse = async (draft: Draft): Promise<Draft> => {
    const saved = await onSaveDraft(draft);
    draftRef.current = saved;
    setWorkingDraft(saved);
    setCreated(saved);
    return saved;
  };
  const ensureCourse = async (targetStep: CreationStep): Promise<Draft> => {
    if (draftRef.current) {
      const updated = withBrief(draftRef.current, targetStep);
      draftRef.current = updated;
      setWorkingDraft(updated);
      return updated;
    }
    const saved = await onCreate(cleanBrief(), targetStep);
    draftRef.current = saved;
    setWorkingDraft(saved);
    setCreated(saved);
    return saved;
  };
  const goToStep = async (target: CreationStep) => {
    if (activeBusy || target < 0 || target > 4 || target > maxStep + 1) return;
    if (target > 0 && !brief.topic.trim()) {
      setError("请先填写课程主题");
      return;
    }
    if (target === 4) {
      if (!draftRef.current?.outline || draftRef.current.task) {
        setError("请先完成课程大纲");
        return;
      }
      try {
        validateDraft(withBrief(draftRef.current, 4));
      } catch (e) {
        setError(errorText(e));
        return;
      }
    }
    setError("");
    if (target !== 4) setPane("content");
    if (target === 3 || target === 4) {
      setBusy(true);
      try {
        await ensureCourse(target);
      } catch (e) {
        setError(errorText(e));
        return;
      } finally {
        setBusy(false);
      }
    }
    setStep(target);
    setMaxStep((value) => Math.max(value, target) as CreationStep);
  };
  const requestClose = async () => {
    if (activeBusy) return;
    if (!currentCourse || !draftRef.current || !brief.topic.trim()) {
      onClose();
      return;
    }
    const baseline =
      currentCourse.status === "stashed"
        ? currentCourse
        : newDraft(briefFromCourse(currentCourse), currentCourse);
    const updated = withBrief(draftRef.current);
    const unchanged =
      currentCourse.status === "ready"
        ? JSON.stringify({ ...updated, creationStep: 4 }) ===
          JSON.stringify(baseline)
        : JSON.stringify(updated) === JSON.stringify(baseline);
    if (unchanged) {
      onClose();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await saveWorkingCourse(updated);
      onStashed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button, input")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  const appendFiles = async (files: File[]) => {
    setBusy(true);
    setError("");
    try {
      if (files.length > 5) throw new Error("每次最多导入 5 个资料文件");
      const sections = await Promise.all(
        files.map(async (file) => {
          if (!/\.(txt|md|markdown)$/i.test(file.name) || file.size > 80000)
            throw new Error("请选择不超过 80 KB 的 TXT / Markdown 文件");
          const content = new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          );
          if (content.includes("\u0000"))
            throw new Error(`${file.name} 不是有效的 UTF-8 文本资料`);
          return `【来源：${file.name.replace(/[\r\n\t]/g, " ").slice(0, 120)}】\n${content.trim()}`;
        }),
      );
      const material = [brief.material.trim(), ...sections]
        .filter(Boolean)
        .join("\n\n");
      if (material.length > 20000)
        throw new Error("参考资料总长度不能超过 20,000 字");
      setBrief((current) => ({ ...current, material }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const stash = async () => {
    if (!brief.topic.trim() || activeBusy) return;
    setError("");
    setBusy(true);
    try {
      if (draftRef.current)
        await saveWorkingCourse(withBrief(draftRef.current));
      else await ensureCourse(step);
      onStashed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!complete || !draftRef.current || activeBusy) return;
    setError("");
    setBusy(true);
    try {
      const saved = await saveWorkingCourse(withBrief(draftRef.current, 4));
      const course = finishDraft(saved);
      await onSave(course);
      onSaved(course);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="learn-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !activeBusy) void requestClose();
      }}
    >
      <div
        className="learn-create-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-create-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !activeBusy) void requestClose();
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled):not([type='file']), select:not(:disabled), textarea:not(:disabled)",
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
        <header className="learn-dialog-header">
          <div>
            <span className="learn-eyebrow">COURSE WORKSPACE</span>
            <h2 id="learn-create-title">
              {initialCourse && shownCourse
                ? `编辑课程 · ${shownCourse.status === "stashed" ? (shownCourse.outline?.title ?? shownCourse.brief.topic) : shownCourse.title}`
                : "创建课程"}
            </h2>
          </div>
          <button
            className="learn-button text"
            aria-label={initialCourse ? "关闭课程编辑" : "关闭创建课程"}
            disabled={activeBusy}
            onClick={() => void requestClose()}
          >
            ×
          </button>
        </header>
        <ol className="learn-dialog-steps" aria-label="课程创建步骤">
          {labels.map((label, i) => (
            <li
              key={label}
              className={i === step ? "active" : i < step ? "done" : ""}
            >
              <button
                type="button"
                aria-current={i === step ? "step" : undefined}
                disabled={activeBusy || i > maxStep}
                onClick={() => void goToStep(i as CreationStep)}
              >
                <span>{i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        {step === 4 && currentCourse?.status === "ready" && (
          <div
            className="learn-dialog-tabs"
            role="tablist"
            aria-label="编辑课程内容"
          >
            <button
              role="tab"
              aria-selected={pane === "content"}
              onClick={() => setPane("content")}
            >
              课程内容
            </button>
            <button
              role="tab"
              aria-selected={pane === "project"}
              onClick={() => setPane("project")}
            >
              项目实训
            </button>
          </div>
        )}
        {error && (
          <div className="learn-dialog-error">
            <Notice>{error}</Notice>
          </div>
        )}
        <div className="learn-dialog-scroll">
          {step < 3 ? (
            <div className="learn-dialog-setup">
              <div className="learn-dialog-body">
                {step === 0 && (
                  <>
                    <h3>你想学什么？</h3>
                    <p>从一个具体主题开始，下一步再安排学习节奏。</p>
                    <label htmlFor="learning-topic">课程主题</label>
                    <input
                      id="learning-topic"
                      required
                      maxLength={200}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void goToStep(1);
                        }
                      }}
                      value={brief.topic}
                      onChange={(e) =>
                        setBrief({ ...brief, topic: e.target.value })
                      }
                      placeholder="例如：从零理解机器学习"
                    />
                  </>
                )}
                {step === 1 && (
                  <>
                    <h3>安排学习节奏</h3>
                    <p>选择当前水平和计划课时，大纲之后仍可调整。</p>
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
                            setBrief({
                              ...brief,
                              count: Number(e.target.value),
                            })
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
                  </>
                )}
                {step === 2 && (
                  <>
                    <h3>添加参考资料</h3>
                    <p>这一步可跳过。资料将用于规划课程内容。</p>
                    <label htmlFor="learning-material">
                      参考资料 · 选填，最多 20,000 字
                    </label>
                    <textarea
                      id="learning-material"
                      rows={6}
                      maxLength={20000}
                      value={brief.material}
                      onChange={(e) =>
                        setBrief({ ...brief, material: e.target.value })
                      }
                      placeholder="粘贴学习笔记、要求或资料摘要"
                    />
                    <label className="learn-file-button learn-button">
                      追加 TXT / Markdown 资料
                      <input
                        type="file"
                        accept=".txt,.md,.markdown"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length) void appendFiles(files);
                        }}
                      />
                    </label>
                    <p className="learn-muted">
                      生成时，主题与参考资料会发送给所选模型。
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : pane === "project" && currentCourse?.status === "ready" ? (
            <ProjectLab
              key={currentCourse.id}
              course={currentCourse}
              mode="design"
            />
          ) : shownCourse ? (
            <Studio
              initialCourse={shownCourse}
              stage={step === 3 ? "outline" : "lessons"}
              onSaveDraft={saveWorkingCourse}
              onDraftChange={(draft) => {
                draftRef.current = draft;
                setWorkingDraft(draft);
              }}
              onBusyChange={setStudioBusy}
            />
          ) : null}
        </div>
        <footer className="learn-dialog-footer">
          <button
            type="button"
            className="learn-button"
            disabled={activeBusy}
            onClick={() =>
              step
                ? void goToStep((step - 1) as CreationStep)
                : void requestClose()
            }
          >
            {step ? "上一步" : "取消"}
          </button>
          <div className="learn-dialog-footer-actions">
            {pane === "project" && step === 4 ? (
              <button
                type="button"
                className="learn-button"
                onClick={() => setPane("content")}
              >
                返回课程内容
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="learn-button"
                  disabled={activeBusy || !brief.topic.trim()}
                  onClick={() => void stash()}
                >
                  暂存
                </button>
                {step < 4 ? (
                  <button
                    type="button"
                    className="learn-button primary"
                    disabled={
                      activeBusy ||
                      !brief.topic.trim() ||
                      (step === 3 && !workingDraft?.outline)
                    }
                    onClick={() => void goToStep((step + 1) as CreationStep)}
                  >
                    {step === 2
                      ? "编辑课程大纲"
                      : step === 3
                        ? "编辑课时内容"
                        : "下一步"}
                    <Icon name="arrow" size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="learn-button primary"
                    disabled={activeBusy || !complete}
                    onClick={() => void save()}
                  >
                    保存课程，开始学习
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
