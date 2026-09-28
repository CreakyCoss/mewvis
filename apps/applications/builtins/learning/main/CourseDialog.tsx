import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import type { Brief } from "./course";
import type { Course } from "./course";
import { Icon, Notice, errorText } from "./components";
import { draftKey } from "./workflow";
import { Studio } from "./Studio";
import { ProjectLab } from "./ProjectLab";

const initial: Brief = { topic: "", level: "零基础", count: 3, material: "" };
const labels = ["学习主题", "学习安排", "参考资料"];

export function CourseDialog({
  onClose,
  onCreate,
  onSave,
  onSaved,
  initialCourse,
}: {
  onClose: () => void;
  onCreate: (brief: Brief) => Promise<void>;
  onSave: (course: Course) => Promise<void>;
  onSaved: (course: Course) => void;
  initialCourse?: Course;
}) {
  const [mode, setMode] = useState<"setup" | "studio">(
    initialCourse ? "studio" : "setup",
  );
  const [pane, setPane] = useState<"content" | "project">("content");
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<Brief>(initial);
  const [existing, setExisting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const checkDraft = async () => {
    setChecking(true);
    setReadFailed(false);
    setError("");
    try {
      setExisting(
        !!(await getApplicationDataClient().storage.getItem(draftKey)),
      );
    } catch (e) {
      setReadFailed(true);
      setError(`读取草稿失败：${errorText(e)}`);
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button, input")?.focus();
    if (!initialCourse) void checkDraft();
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
  const next = async () => {
    setError("");
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        ...brief,
        topic: brief.topic.trim(),
        material: brief.material.trim(),
      });
      setMode("studio");
      setBusy(false);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div
      className="learn-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`learn-create-dialog ${mode === "setup" ? "is-setup" : ""}`}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-create-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
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
              {initialCourse ? `编辑课程 · ${initialCourse.title}` : "创建课程"}
            </h2>
          </div>
          <button
            className="learn-button text"
            aria-label={initialCourse ? "关闭课程编辑" : "关闭创建课程"}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {mode === "studio" ? (
          <div className="learn-dialog-workspace">
            {initialCourse && (
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
            <div className="learn-dialog-scroll">
              {pane === "project" && initialCourse ? (
                <ProjectLab
                  key={initialCourse.id}
                  course={initialCourse}
                  mode="design"
                />
              ) : (
                <Studio
                  initialCourse={initialCourse}
                  onSave={onSave}
                  onSaved={onSaved}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="learn-dialog-setup">
            {error && <Notice>{error}</Notice>}
            {checking ? (
              <p className="learn-muted">正在检查课程草稿…</p>
            ) : readFailed ? (
              <div className="learn-dialog-resume">
                <button
                  className="learn-button"
                  onClick={() => void checkDraft()}
                >
                  重试读取草稿
                </button>
              </div>
            ) : existing ? (
              <div className="learn-dialog-resume">
                <h3>已有一门未完成的课程</h3>
                <p>
                  可以继续上次的课程，也可以重新开始。重新开始会替换这份草稿。
                </p>
                <div className="learn-actions">
                  <button
                    className="learn-button primary"
                    onClick={() => setMode("studio")}
                  >
                    继续草稿
                  </button>
                  <button
                    className="learn-button"
                    onClick={() => setExisting(false)}
                  >
                    新建课程，替换草稿
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void next();
                }}
              >
                <ol className="learn-dialog-steps" aria-label="创建课程步骤">
                  {labels.map((label, i) => (
                    <li
                      key={label}
                      className={i === step ? "active" : i < step ? "done" : ""}
                      aria-current={i === step ? "step" : undefined}
                    >
                      <span>{i + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
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
                <footer className="learn-dialog-footer">
                  <button
                    type="button"
                    className="learn-button"
                    onClick={() => (step ? setStep(step - 1) : onClose())}
                    disabled={busy}
                  >
                    {step ? "上一步" : "取消"}
                  </button>
                  <button
                    className="learn-button primary"
                    disabled={busy || (step === 0 && !brief.topic.trim())}
                  >
                    {busy
                      ? "保存中…"
                      : step === 2
                        ? "保存需求，开始规划"
                        : "下一步"}
                    <Icon name="arrow" size={16} />
                  </button>
                </footer>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
