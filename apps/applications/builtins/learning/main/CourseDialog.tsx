import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import type { Brief } from "./course";
import type { Course } from "./course";
import { Icon, Notice, errorText } from "./components";
import {
  finishDraft,
  newDraft,
  validateDraft,
  validateOutline,
  type CourseEntry,
  type Draft,
} from "./workflow";
import { Studio } from "./Studio";
import { CourseAssistant } from "./CourseAssistant";
import { OutlineEditor } from "./OutlineEditor";
import { ProjectDesigner, starterProjectPlan } from "./ProjectDesigner";
import {
  createProject,
  projectKey,
  saveProject,
  validatePlan,
  validateProject,
  type Project,
  type ProjectPlan,
} from "./pbl";

const initial: Brief = { topic: "", level: "零基础", material: "" };
const labels = ["课程设置", "课程大纲", "课时内容", "项目实训"];
const sublabels = ["主题与资料", "目标与路径", "统一维护课时", "可选的实践环节"];
type CreationStep = 0 | 1 | 2 | 3;
const briefFromCourse = (course?: CourseEntry): Brief =>
  !course
    ? initial
    : course.status === "stashed"
      ? course.brief
      : {
          topic: course.title,
          level: course.level,
          material: course.material ?? "",
        };

export function CourseDialog({
  onClose,
  onSave,
  onSaveDraft,
  onSaved,
  onStashed,
  initialCourse,
}: {
  onClose: () => void;
  onSave: (course: Course) => Promise<void>;
  onSaveDraft: (draft: Draft) => Promise<Draft>;
  onSaved: (course: Course) => void;
  onStashed: () => void;
  initialCourse?: CourseEntry;
}) {
  const startingStep: CreationStep =
    initialCourse?.status === "stashed" ? initialCourse.creationStep : 0;
  const [step, setStep] = useState<CreationStep>(startingStep);
  const [maxStep, setMaxStep] = useState<CreationStep>(
    initialCourse?.status === "ready" ? 3 : startingStep,
  );
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
  const [projectRecord, setProjectRecord] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(
    initialCourse?.status === "ready" && initialCourse.projectEnabled === true,
  );
  const [activeLesson, setActiveLesson] = useState<{
    id: string;
    title: string;
    objective: string;
    creating: boolean;
  } | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [studioRevision, setStudioRevision] = useState(0);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const draftRef = useRef<Draft | null>(workingDraft);
  const currentCourse = created ?? initialCourse;
  const shownCourse = workingDraft ?? currentCourse;
  const activeBusy = busy || studioBusy || assistantBusy || projectLoading;
  const projectReady =
    !workingDraft?.projectEnabled ||
    (() => {
      try {
        validatePlan(workingDraft.projectPlan);
        return true;
      } catch {
        return false;
      }
    })();
  const projectLocked = Object.values(projectRecord?.progress ?? {}).some(
    (progress) => !!progress.submission,
  );
  const updateDraft = (next: Draft) => {
    draftRef.current = next;
    setWorkingDraft(next);
  };
  useEffect(() => {
    if (!initialCourse || initialCourse.status !== "ready" || !initialCourse.projectEnabled)
      return;
    let alive = true;
    void getApplicationDataClient()
      .storage.getItem(projectKey(initialCourse.id))
      .then((raw) => {
        if (!alive || raw === null) return;
        const saved = validateProject(raw, initialCourse.id);
        setProjectRecord(saved);
        if (saved.plan && draftRef.current) {
          updateDraft({ ...draftRef.current, projectPlan: saved.plan });
        }
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => {
        if (alive) setProjectLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [initialCourse]);
  const complete =
    !!workingDraft?.outline &&
    !workingDraft.task &&
    workingDraft.outline.lessons.length > 0 &&
    workingDraft.outline.lessons.every((slot) => !!slot.lesson);
  const cleanBrief = (): Brief => ({
    ...brief,
    topic: brief.topic.trim(),
    material: brief.material.trim(),
  });
  const withBrief = (draft: Draft, targetStep: CreationStep = step): Draft => {
    const next = cleanBrief();
    return {
      ...draft,
      brief: next,
      creationStep: targetStep,
      outline: draft.outline
        ? { ...draft.outline, title: next.topic, level: next.level }
        : null,
    };
  };
  const saveWorkingCourse = async (draft: Draft): Promise<Draft> => {
    const saved = await onSaveDraft(draft);
    updateDraft(saved);
    setCreated(saved);
    return saved;
  };
  const ensureCourse = async (targetStep: CreationStep): Promise<Draft> => {
    if (draftRef.current) {
      const updated = withBrief(draftRef.current, targetStep);
      updateDraft(updated);
      return updated;
    }
    const next = newDraft(cleanBrief(), undefined, targetStep);
    updateDraft(next);
    setCreated(next);
    return next;
  };
  const goToStep = async (target: CreationStep) => {
    if (activeBusy || target < 0 || target > 3 || target > maxStep + 1) return;
    if (draftRef.current?.task && target !== step) {
      setError("请先完成或结束当前 AI 任务");
      return;
    }
    if (target > 0 && !brief.topic.trim()) {
      setError("请先填写课程主题");
      return;
    }
    if (target >= 2) {
      if (!draftRef.current?.outline || draftRef.current.task) {
        setError("请先完成课程大纲");
        return;
      }
      try {
        validateOutline(draftRef.current.outline);
        validateDraft(withBrief(draftRef.current, target));
      } catch (e) {
        setError(errorText(e));
        return;
      }
    }
    setError("");
    if (target >= 1) {
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
    if (!busy) onClose();
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
      else await saveWorkingCourse(newDraft(cleanBrief(), undefined, step));
      onStashed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (
      !complete ||
      !draftRef.current ||
      (draftRef.current.projectEnabled && !projectReady) ||
      activeBusy
    )
      return;
    setError("");
    setBusy(true);
    try {
      const prepared = withBrief(draftRef.current, 3);
      const course = finishDraft(prepared);
      if (prepared.projectEnabled) {
        const plan = validatePlan(prepared.projectPlan);
        const source = {
          id: course.id,
          title: course.title,
          lessons: course.lessons.map(({ id, title, objective }) => ({
            id,
            title,
            objective,
          })),
        };
        await saveProject(getApplicationDataClient().storage, {
          ...(projectRecord ?? createProject(source)),
          courseTitle: course.title,
          sourceLessons: source.lessons,
          plan,
        });
      }
      await onSave(course);
      onSaved(course);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const setProjectEnabled = (enabled: boolean) => {
    if (!draftRef.current || projectLocked || projectLoading) return;
    const next = {
      ...draftRef.current,
      projectEnabled: enabled,
      ...(enabled && !draftRef.current.projectPlan
        ? { projectPlan: starterProjectPlan(brief.topic.trim()) }
        : {}),
      creationStep: 3 as const,
    };
    updateDraft(next);
  };
  return (
    <div className="learn-dialog-backdrop">
      <div
        className="learn-create-dialog"
        ref={dialog}
        role="region"
        aria-labelledby="learn-create-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) void requestClose();
        }}
      >
        <header className="learn-dialog-header">
          <div className="learn-course-header-title">
            <h2 id="learn-create-title">{initialCourse ? "编辑课程" : "创建课程"}</h2>
            <span>{brief.topic.trim() || "未命名课程"}</span>
          </div>
          <button
            className="learn-button text"
            aria-label={initialCourse ? "关闭课程编辑" : "关闭创建课程"}
            disabled={busy}
            onClick={() => void requestClose()}
          >
            ×
          </button>
        </header>
        <div className="learn-editor-grid">
        <div className="learn-course-main">
        <ol className="learn-dialog-steps" aria-label="课程创建步骤">
          {labels.map((label, i) => (
            <li
              key={label}
              className={i === step ? "active" : i < step ? "done" : ""}
            >
              <button
                type="button"
                aria-current={i === step ? "step" : undefined}
                disabled={
                  activeBusy ||
                  i > maxStep + 1 ||
                  (!!workingDraft?.task && i !== step)
                }
                onClick={() => void goToStep(i as CreationStep)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="learn-step-copy">
                  <strong>{label}</strong>
                  <small>{sublabels[i]}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
        {error && (
          <div className="learn-dialog-error">
            <Notice>{error}</Notice>
          </div>
        )}
        <div className="learn-dialog-scroll">
          {step === 0 ? (
            <div className="learn-dialog-setup">
              <div className="learn-dialog-body">
                <div className="learn-setup-intro">
                  <h3>课程设置</h3>
                </div>
                <div className="learn-setup-card learn-setup-form">
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
                  <div className="learn-level-group">
                    <span>当前水平</span>
                    <div>
                      {["零基础", "了解一些", "希望进阶"].map((level) => (
                        <label key={level} className={brief.level === level ? "selected" : ""}>
                          <input
                            type="radio"
                            name="learning-level"
                            value={level}
                            checked={brief.level === level}
                            onChange={() => setBrief({ ...brief, level })}
                          />
                          <strong>{level}</strong>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="learn-setup-reference">
                    <label htmlFor="learning-material">
                      参考资料 <span>选填</span>
                    </label>
                    <textarea
                      id="learning-material"
                      rows={4}
                      maxLength={20000}
                      value={brief.material}
                      onChange={(e) =>
                        setBrief({ ...brief, material: e.target.value })
                      }
                      placeholder="粘贴学习笔记、课程要求或资料摘要…"
                    />
                    <label className="learn-file-button learn-button">
                      上传 TXT / Markdown
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
                  </div>
                </div>
              </div>
            </div>
          ) : step === 1 ? (
            <OutlineEditor
              brief={brief}
              outline={workingDraft?.outline ?? null}
              onChange={(outline) => {
                if (draftRef.current)
                  updateDraft({ ...draftRef.current, outline, creationStep: 1 });
              }}
            />
          ) : step === 3 ? (
            <div className="learn-project-step">
              <div className="learn-project-step-main">
                <div className="learn-screen-heading">
                  <h2>项目实训</h2>
                </div>
                <div className="learn-project-choice">
                  <label
                    className={!workingDraft?.projectEnabled ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="project-enabled"
                      checked={!workingDraft?.projectEnabled}
                      disabled={projectLocked || projectLoading}
                      onChange={() => setProjectEnabled(false)}
                    />
                    <span>
                      <strong>暂不添加</strong>
                    </span>
                  </label>
                  <label
                    className={workingDraft?.projectEnabled ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="project-enabled"
                      checked={!!workingDraft?.projectEnabled}
                      disabled={projectLocked || projectLoading}
                      onChange={() => setProjectEnabled(true)}
                    />
                    <span>
                      <strong>添加项目实训</strong>
                    </span>
                  </label>
                </div>
                {workingDraft?.projectEnabled && workingDraft.projectPlan && (
                  <ProjectDesigner
                    plan={workingDraft.projectPlan}
                    locked={projectLocked}
                    onChange={(plan) => {
                      if (draftRef.current)
                        updateDraft({
                          ...draftRef.current,
                          projectPlan: plan,
                          creationStep: 3,
                        });
                    }}
                  />
                )}
              </div>
            </div>
          ) : shownCourse ? (
            <Studio
              key={`lesson-studio-${studioRevision}`}
              initialCourse={shownCourse}
              stage="lessons"
              onSaveDraft={async (draft) => {
                updateDraft(draft);
                return draft;
              }}
              onDraftChange={updateDraft}
              onBusyChange={setStudioBusy}
              onLessonContextChange={setActiveLesson}
            />
          ) : null}
        </div>
        </div>
        <CourseAssistant
          step={step}
          brief={brief}
          draft={workingDraft}
          activeLesson={activeLesson}
          projectPlan={workingDraft?.projectPlan}
          projectLocked={projectLocked || projectLoading}
          onApplyTopic={(topic) => setBrief((current) => ({ ...current, topic }))}
          onApplyOutline={(outline) => {
            if (draftRef.current)
              updateDraft({
                ...draftRef.current,
                outline: {
                  ...outline,
                  lessons: draftRef.current.outline?.lessons ?? [],
                },
                creationStep: 1,
              });
          }}
          onApplyLesson={(draft, targetId) => {
            const current = draftRef.current;
            const adopted = draft.outline?.lessons.find((slot) => slot.id === targetId);
            if (!current?.outline || !adopted) return;
            const exists = current.outline.lessons.some((slot) => slot.id === targetId);
            updateDraft({
              ...current,
              outline: {
                ...current.outline,
                lessons: exists
                  ? current.outline.lessons.map((slot) =>
                      slot.id === targetId ? adopted : slot,
                    )
                  : [...current.outline.lessons, adopted],
              },
              creationStep: 2,
            });
            setStudioRevision((value) => value + 1);
          }}
          onApplyProject={(plan) => {
            if (draftRef.current && !projectLocked && !projectLoading)
              updateDraft({
                ...draftRef.current,
                projectEnabled: true,
                projectPlan: plan,
                creationStep: 3,
              });
          }}
          onTaskActiveChange={setAssistantBusy}
        />
        </div>
        <footer className="learn-dialog-footer">
          <button
            type="button"
            className="learn-button"
            disabled={activeBusy || !step || !!workingDraft?.task}
            onClick={() => void goToStep((step - 1) as CreationStep)}
          >
            上一步
          </button>
          <div className="learn-dialog-footer-actions">
            <button
              type="button"
              className="learn-button"
              disabled={activeBusy || !brief.topic.trim()}
              onClick={() => void stash()}
            >
              暂存
            </button>
            {step < 3 ? (
              <button
                type="button"
                className="learn-button primary"
                disabled={
                  activeBusy ||
                  !brief.topic.trim() ||
                  (step === 1 && !workingDraft?.outline)
                }
                onClick={() => void goToStep((step + 1) as CreationStep)}
              >
                {step === 0
                  ? "下一步：课程大纲"
                  : step === 1
                    ? "下一步：课时内容"
                    : "下一步：项目实训"}
                <Icon name="arrow" size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="learn-button primary"
                disabled={
                  activeBusy ||
                  !complete ||
                  (!!workingDraft?.projectEnabled && !projectReady)
                }
                onClick={() => void save()}
              >
                保存课程
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
