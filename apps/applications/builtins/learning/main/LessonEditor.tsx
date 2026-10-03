import { SelectField } from "./SelectField";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lesson, Question } from "./course";
import { Notice, errorText } from "./components";
import { blocksToText, formulaLatex, validateBlocks, validateExperiment, type ContentBlock, type ExperimentConfig } from "./richContent";
import { RichContentEditor } from "./RichContentEditor";
import { ExperimentEditor } from "./ExperimentEditor";
import { createExperimentPreset } from "./experimentPresets";

type EditableQuestion = {
  type: Question["type"];
  points: string;
  question: string;
  options: { value: string; label: string }[];
  answer: string | string[];
  explanation: string;
  rubric: string;
};
const blankQuestion = (): EditableQuestion => ({
  type: "single_choice",
  points: "1",
  question: "",
  options: [
    { value: "A", label: "" },
    { value: "B", label: "" },
  ],
  answer: "",
  explanation: "",
  rubric: "",
});
export function LessonEditor({
  lesson,
  title,
  objective,
  onSave,
  onCancel,
  onValueChange,
}: {
  lesson?: Lesson;
  title: string;
  objective: string;
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
  onValueChange?: (value: { title: string; objective: string; value: unknown; section: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState<"basics" | "content" | "experiment" | "quiz">("basics");
  const [initialBlocks] = useState<ContentBlock[]>(() => lesson?.blocks ?? [{ id: crypto.randomUUID(), type: "text", text: lesson?.content ?? "" }]);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [experimentEnabled, setExperimentEnabled] = useState(!!lesson?.experiment);
  const [experiment, setExperiment] = useState<ExperimentConfig>(lesson?.experiment ?? createExperimentPreset());
  const [value, setValue] = useState({
    title,
    objective,
    content: lesson?.content ?? "",
    example: lesson?.example ?? "",
    takeaways: (lesson?.takeaways ?? []).join("\n"),
  });
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    lesson?.questions.map((q) => ({
      ...q,
      points: String(q.points),
      options: [...q.options],
      rubric: q.type === "short_answer" ? q.rubric : "",
    })) ?? [blankQuestion()],
  );
  const editorValue = useMemo(() => ({
    ...value,
    content: lesson && !lesson.blocks && JSON.stringify(blocks) === JSON.stringify(initialBlocks) ? lesson.content : blocksToText(blocks, experimentEnabled ? experiment : undefined),
    ...(lesson?.blocks || JSON.stringify(blocks) !== JSON.stringify(initialBlocks) ? { blocks } : {}),
    ...(experimentEnabled ? { experiment } : {}),
    takeaways: value.takeaways.split("\n").map(s => s.trim()).filter(Boolean),
    questions: questions.map(question => ({ ...question, points: Number(question.points) })),
  }), [value, blocks, initialBlocks, lesson, experimentEnabled, experiment, questions]);
  useEffect(() => {
    onValueChangeRef.current?.({ title: value.title, objective: value.objective, value: editorValue, section: { basics: "课时信息", content: "教学内容", experiment: "动手实验", quiz: "课后测验" }[activeTab] });
  }, [editorValue, activeTab, value.title, value.objective]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const update = (index: number, patch: Partial<EditableQuestion>) => {
    setQuestions((all) =>
      all.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
    setFieldErrors({});
  };
  const changeValue = (key: keyof typeof value, text: string) => {
    setValue((previous) => ({ ...previous, [key]: text }));
    setFieldErrors({});
  };
  const validate = () => {
    const invalid: Record<string, string> = {};
    const requireText = (key: string, text: string, label: string) => {
      if (!text.trim()) invalid[key] = `请填写${label}`;
    };
    requireText("title", value.title, "课时标题");
    requireText("objective", value.objective, "学习目标");
    try {
      const content = blocksToText(validateBlocks(blocks, experimentEnabled ? experiment : undefined), experimentEnabled ? experiment : undefined);
      if (content.length > 8000) invalid.content = "教学内容合计不能超过 8,000 字";
    } catch (e) { invalid.content = errorText(e); }
    if (experimentEnabled) {
      try { validateExperiment(experiment); } catch (e) { invalid.experiment = errorText(e); }
    }
    requireText("example", value.example, "具体示例");
    const takeaways = value.takeaways
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!takeaways.length) invalid.takeaways = "请至少填写一条知识要点";
    else if (takeaways.length > 6 || takeaways.some((s) => s.length > 500))
      invalid.takeaways = "知识要点应为 1–6 条，每条不超过 500 字";
    questions.forEach((q, i) => {
      requireText(`q${i}-question`, q.question, `第 ${i + 1} 题题干`);
      const points = Number(q.points);
      if (
        !q.points.trim() ||
        !Number.isFinite(points) ||
        points < 0.5 ||
        points > 10 ||
        !Number.isInteger(points * 2)
      )
        invalid[`q${i}-points`] = "请输入 0.5–10 分，按 0.5 分递增";
      requireText(`q${i}-explanation`, q.explanation, `第 ${i + 1} 题答案解析`);
      if (q.type === "short_answer") {
        requireText(
          `q${i}-answer`,
          q.answer as string,
          `第 ${i + 1} 题参考答案`,
        );
        requireText(`q${i}-rubric`, q.rubric, `第 ${i + 1} 题评分标准`);
      } else {
        if (q.options.some((option) => !option.label.trim()))
          invalid[`q${i}-options`] = "请填写所有选项内容";
        if (Array.isArray(q.answer) ? !q.answer.length : !q.answer)
          invalid[`q${i}-answer`] = "请选择正确答案";
      }
    });
    setFieldErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) {
      setActiveTab(
        first === "title" || first === "objective"
          ? "basics"
          : first === "experiment" ? "experiment" : first.startsWith("q")
            ? "quiz"
            : "content",
      );
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(
          `[data-lesson-field="${first}"]`,
        );
        target?.focus();
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
    return !first;
  };
  return (
    <section className="learn-manual-editor" aria-label="手动编辑课时">
      {error && <Notice>{error}</Notice>}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (lock.current) return;
          if (!validate()) return;
          lock.current = true;
          setBusy(true);
          setError("");
          void onSave(editorValue)
            .catch((e) => setError(errorText(e)))
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        <div className="learn-lesson-form-fields">
          <nav className="learn-lesson-section-nav" role="tablist" aria-label="课时编辑区域">
            {[
              ["basics", "课时信息"],
              ["content", "教学内容"],
              ["experiment", "动手实验"],
              ["quiz", "课后测验"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`learn-lesson-${tab}`}
                onClick={() => setActiveTab(tab as typeof activeTab)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="learn-lesson-form-main">
            <fieldset
              id="learn-lesson-basics"
              className="learn-lesson-basics"
              disabled={busy}
              hidden={activeTab !== "basics"}
            >
              <legend>课时信息</legend>
              <label>
                课时标题
                <input
                  required
                  maxLength={120}
                  data-lesson-field="title"
                  aria-invalid={!!fieldErrors.title}
                  value={value.title}
                  onChange={(e) => changeValue("title", e.target.value)}
                />
                {fieldErrors.title && (
                  <small className="learn-field-error">
                    {fieldErrors.title}
                  </small>
                )}
              </label>
              <label>
                学习目标
                <textarea
                  required
                  rows={2}
                  maxLength={500}
                  aria-label="学习目标"
                  data-lesson-field="objective"
                  aria-invalid={!!fieldErrors.objective}
                  value={value.objective}
                  onChange={(e) => changeValue("objective", e.target.value)}
                />
                {fieldErrors.objective && (
                  <small className="learn-field-error">
                    {fieldErrors.objective}
                  </small>
                )}
              </label>
            </fieldset>
            <fieldset
              id="learn-lesson-content"
              className="learn-lesson-content-fields"
              disabled={busy}
              hidden={activeTab !== "content"}
            >
              <legend>教学内容</legend>
              {fieldErrors.content && <p className="learn-field-error" role="alert">{fieldErrors.content}</p>}
              <RichContentEditor experiment={experimentEnabled ? experiment : undefined} blocks={blocks} onChange={(next) => { setBlocks(next); setFieldErrors({}); }} />
              <label>
                具体示例
                <textarea
                  required
                  rows={5}
                  maxLength={4000}
                  aria-label="具体示例"
                  data-lesson-field="example"
                  aria-invalid={!!fieldErrors.example}
                  value={value.example}
                  onChange={(e) => changeValue("example", e.target.value)}
                />
                {fieldErrors.example && (
                  <small className="learn-field-error">
                    {fieldErrors.example}
                  </small>
                )}
              </label>
              <label>
                知识要点（每行一条，1–6 条）
                <textarea
                  required
                  rows={4}
                  maxLength={3005}
                  aria-label="知识要点（每行一条，1–6 条）"
                  data-lesson-field="takeaways"
                  aria-invalid={!!fieldErrors.takeaways}
                  value={value.takeaways}
                  onChange={(e) => changeValue("takeaways", e.target.value)}
                />
                {fieldErrors.takeaways && (
                  <small className="learn-field-error">
                    {fieldErrors.takeaways}
                  </small>
                )}
              </label>
            </fieldset>
            <fieldset id="learn-lesson-experiment" disabled={busy} hidden={activeTab !== "experiment"}>
              <legend>动手实验</legend>
              {fieldErrors.experiment && <p className="learn-field-error" role="alert">{fieldErrors.experiment}</p>}
              <ExperimentEditor enabled={experimentEnabled} value={experiment} onToggle={(enabled) => { if (!enabled) setBlocks(current => current.map(block => { if (block.type !== "formula" || !block.experimentOutput) return block; let latex = block.latex; try { latex = formulaLatex(block, experiment); } catch {} const { experimentOutput, ...independent } = block; return { ...independent, latex }; })); setExperimentEnabled(enabled); }} onChange={(next) => { setExperiment(next); setFieldErrors({}); }} />
            </fieldset>
            <div id="learn-lesson-quiz" hidden={activeTab !== "quiz"}>
            <div className="learn-quiz-heading">
              <div>
                <h2>课后测验</h2>
                <p>共 {questions.length} 道题 · 总分 {questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0)} 分</p>
              </div>
              <button
                type="button"
                className="learn-button compact learn-add-question"
                disabled={busy || questions.length >= 3}
                onClick={() => setQuestions([...questions, blankQuestion()])}
              >
                + 添加题目
              </button>
            </div>
            {questions.map((q, i) => (
              <fieldset
                key={i}
                className="learn-lesson-question"
                aria-label={`第 ${i + 1} 题`}
                disabled={busy}
              >
                <div className="learn-question-heading">
                  <strong>第 {String(i + 1).padStart(2, "0")} 题</strong>
                  <div className="learn-question-controls">
                    <label className="learn-question-type">
                      <span>题型</span>
                      <SelectField
                        aria-label={`第 ${i + 1} 题题型`}
                        value={q.type}
                        onChange={(e) => {
                          const type = e.target.value as Question["type"];
                          update(i, {
                            type,
                            answer: type === "multiple_choice" ? [] : "",
                            options:
                              type === "short_answer"
                                ? []
                                : q.options.length >= 2
                                  ? q.options
                                  : blankQuestion().options,
                          });
                        }}
                      >
                        <option value="single_choice">单选</option>
                        <option value="multiple_choice">多选</option>
                        <option value="short_answer">简答</option>
                      </SelectField>
                    </label>
                    <label className="learn-question-points">
                      <span>分值</span>
                      <span className="learn-points-input">
                        <input
                          type="number"
                          min="0.5"
                          max="10"
                          step="0.5"
                          required
                          aria-label={`第 ${i + 1} 题分值`}
                          data-lesson-field={`q${i}-points`}
                          aria-invalid={!!fieldErrors[`q${i}-points`]}
                          value={q.points}
                          onChange={(e) => update(i, { points: e.target.value })}
                        />
                        <span>分</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="learn-button text compact learn-question-remove"
                      disabled={questions.length <= 1}
                      onClick={() =>
                        setQuestions(questions.filter((_, k) => k !== i))
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="learn-question-body">
                {fieldErrors[`q${i}-points`] && (
                  <small className="learn-field-error">{fieldErrors[`q${i}-points`]}</small>
                )}
                <label>
                  题干
                  <textarea
                    required
                    maxLength={1000}
                    rows={2}
                    aria-label="题干"
                    data-lesson-field={`q${i}-question`}
                    aria-invalid={!!fieldErrors[`q${i}-question`]}
                    value={q.question}
                    onChange={(e) => update(i, { question: e.target.value })}
                  />
                  {fieldErrors[`q${i}-question`] && (
                    <small className="learn-field-error">
                      {fieldErrors[`q${i}-question`]}
                    </small>
                  )}
                </label>
                {q.type === "short_answer" ? (
                  <div className="learn-question-short-answer">
                    <label>
                      参考答案
                      <textarea
                        required
                        rows={3}
                        maxLength={2000}
                        aria-label="参考答案"
                        data-lesson-field={`q${i}-answer`}
                        aria-invalid={!!fieldErrors[`q${i}-answer`]}
                        value={q.answer as string}
                        onChange={(e) => update(i, { answer: e.target.value })}
                      />
                      {fieldErrors[`q${i}-answer`] && (
                        <small className="learn-field-error">
                          {fieldErrors[`q${i}-answer`]}
                        </small>
                      )}
                    </label>
                    <label>
                      评分标准（满分 {q.points || "—"} 分）
                      <textarea
                        required
                        rows={3}
                        maxLength={2000}
                        aria-label={`评分标准（满分 ${q.points || "—"} 分）`}
                        data-lesson-field={`q${i}-rubric`}
                        aria-invalid={!!fieldErrors[`q${i}-rubric`]}
                        value={q.rubric}
                        onChange={(e) => update(i, { rubric: e.target.value })}
                      />
                      {fieldErrors[`q${i}-rubric`] && (
                        <small className="learn-field-error">
                          {fieldErrors[`q${i}-rubric`]}
                        </small>
                      )}
                    </label>
                  </div>
                ) : (
                  <div className="learn-question-options">
                    <div className="learn-question-options-heading">
                      <strong>选项与正确答案</strong>
                      <span>{q.type === "multiple_choice" ? "勾选所有正确选项" : "选择一个正确选项"}</span>
                    </div>
                    {q.options.map((o, j) => (
                      <div key={o.value} className="learn-edit-option">
                        <label className="learn-correct-choice">
                          <input
                            aria-label={`第 ${i + 1} 题正确答案 ${o.value}`}
                            type={
                              q.type === "multiple_choice"
                                ? "checkbox"
                                : "radio"
                            }
                            name={`editor-answer-${i}`}
                            data-lesson-field={
                              j === 0 ? `q${i}-answer` : undefined
                            }
                            checked={
                              Array.isArray(q.answer)
                                ? q.answer.includes(o.value)
                                : q.answer === o.value
                            }
                            onChange={(e) =>
                              update(i, {
                                answer:
                                  q.type === "multiple_choice"
                                    ? e.target.checked
                                      ? [...(q.answer as string[]), o.value]
                                      : (q.answer as string[]).filter(
                                          (a) => a !== o.value,
                                        )
                                    : o.value,
                              })
                            }
                          />
                          {o.value}
                        </label>
                        <input
                          required
                          aria-label={`第 ${i + 1} 题选项 ${o.value}`}
                          data-lesson-field={
                            j === 0 ? `q${i}-options` : undefined
                          }
                          maxLength={500}
                          value={o.label}
                          onChange={(e) =>
                            update(i, {
                              options: q.options.map((v, k) =>
                                k === j ? { ...v, label: e.target.value } : v,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="learn-button text compact"
                          aria-label={`删除第 ${i + 1} 题选项 ${o.value}`}
                          disabled={q.options.length <= 2}
                          onClick={() =>
                            update(i, {
                              options: q.options.filter((_, k) => k !== j),
                              answer: Array.isArray(q.answer)
                                ? q.answer.filter((a) => a !== o.value)
                                : q.answer === o.value
                                  ? ""
                                  : q.answer,
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {(fieldErrors[`q${i}-options`] ||
                      fieldErrors[`q${i}-answer`]) && (
                      <small className="learn-field-error">
                        {fieldErrors[`q${i}-options`] ||
                          fieldErrors[`q${i}-answer`]}
                      </small>
                    )}
                    <button
                      type="button"
                      className="learn-button compact learn-add-option"
                      disabled={q.options.length >= 5}
                      onClick={() =>
                        update(i, {
                          options: [
                            ...q.options,
                            {
                              value: ["A", "B", "C", "D", "E"].find(
                                (v) => !q.options.some((o) => o.value === v),
                              )!,
                              label: "",
                            },
                          ],
                        })
                      }
                    >
                      + 添加选项
                    </button>
                  </div>
                )}
                <label>
                  答案解析
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    aria-label="答案解析"
                    data-lesson-field={`q${i}-explanation`}
                    aria-invalid={!!fieldErrors[`q${i}-explanation`]}
                    value={q.explanation}
                    onChange={(e) => update(i, { explanation: e.target.value })}
                  />
                  {fieldErrors[`q${i}-explanation`] && (
                    <small className="learn-field-error">
                      {fieldErrors[`q${i}-explanation`]}
                    </small>
                  )}
                </label>
                </div>
              </fieldset>
            ))}
            </div>
          </div>
        </div>
        <footer className="learn-actions learn-lesson-editor-footer">
          <small className="learn-muted learn-lesson-save-note">修改尚未保存到课程</small>
          <button
            type="button"
            className="learn-button"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="submit"
            className="learn-button primary"
            disabled={busy}
          >
            {busy ? "保存中…" : "保存课时"}
          </button>
        </footer>
      </form>
    </section>
  );
}
