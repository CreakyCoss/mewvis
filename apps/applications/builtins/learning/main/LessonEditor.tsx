import { useRef, useState } from "react";
import type { Lesson, Question } from "./course";
import { Notice, errorText } from "./components";

type EditableQuestion = {
  type: Question["type"];
  question: string;
  options: { value: string; label: string }[];
  answer: string | string[];
  explanation: string;
  rubric: string;
};
const blankQuestion = (): EditableQuestion => ({
  type: "single_choice",
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
  onSaveOutline,
  onCancel,
}: {
  lesson?: Lesson;
  title: string;
  objective: string;
  onSave: (value: unknown) => Promise<void>;
  onSaveOutline: (title: string, objective: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState({
    title,
    objective,
    content: lesson?.content ?? "",
    example: lesson?.example ?? "",
    takeaways: (lesson?.takeaways ?? []).join("\n"),
  });
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    lesson?.questions.map((q) => ({
      ...q,
      options: [...q.options],
      rubric: q.type === "short_answer" ? q.rubric : "",
    })) ?? [blankQuestion()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const update = (index: number, patch: Partial<EditableQuestion>) =>
    setQuestions((all) =>
      all.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  return (
    <section className="learn-manual-editor" aria-label="手动编辑课时">
      <div className="learn-manual-editor-header">
        <h1>编辑课时</h1>
        <button
          type="button"
          className="learn-button text"
          aria-label="关闭课时编辑"
          disabled={busy}
          onClick={onCancel}
        >
          ×
        </button>
      </div>
      <p className="learn-muted">
        可以先保存标题与目标，再逐步补充正文和测验。修改已完成课时的标题或目标会清除本课内容；内容变更会重置本课旧测验和完成状态。
      </p>
      {error && <Notice>{error}</Notice>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          void onSave({
            ...value,
            takeaways: value.takeaways
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            questions,
          })
            .catch((e) => setError(errorText(e)))
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        <fieldset disabled={busy}>
          <legend>课时安排</legend>
          <label>
            课时标题
            <input
              required
              maxLength={120}
              value={value.title}
              onChange={(e) => setValue({ ...value, title: e.target.value })}
            />
          </label>
          <label>
            学习目标
            <textarea
              required
              rows={2}
              maxLength={500}
              aria-label="学习目标"
              value={value.objective}
              onChange={(e) =>
                setValue({ ...value, objective: e.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="learn-button"
            disabled={busy}
            onClick={() => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              void onSaveOutline(value.title, value.objective)
                .catch((e) => setError(errorText(e)))
                .finally(() => {
                  lock.current = false;
                  setBusy(false);
                });
            }}
          >
            保存标题与目标
          </button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>教学内容</legend>
          <label>
            课时正文
            <textarea
              required
              rows={10}
              maxLength={8000}
              aria-label="课时正文"
              value={value.content}
              onChange={(e) => setValue({ ...value, content: e.target.value })}
            />
          </label>
          <label>
            具体示例
            <textarea
              required
              rows={5}
              maxLength={4000}
              aria-label="具体示例"
              value={value.example}
              onChange={(e) => setValue({ ...value, example: e.target.value })}
            />
          </label>
          <label>
            知识要点（每行一条，1–6 条）
            <textarea
              required
              rows={4}
              maxLength={3005}
              aria-label="知识要点（每行一条，1–6 条）"
              value={value.takeaways}
              onChange={(e) =>
                setValue({ ...value, takeaways: e.target.value })
              }
            />
          </label>
        </fieldset>
        <h2>课后测验 · 1–3 道题，每题 1 分</h2>
        {questions.map((q, i) => (
          <fieldset key={i} disabled={busy}>
            <legend>第 {i + 1} 题</legend>
            <label>
              题型
              <select
                aria-label="题型"
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
              </select>
            </label>
            <label>
              题干
              <textarea
                required
                maxLength={1000}
                rows={2}
                aria-label="题干"
                value={q.question}
                onChange={(e) => update(i, { question: e.target.value })}
              />
            </label>
            {q.type === "short_answer" ? (
              <>
                <label>
                  参考答案
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    aria-label="参考答案"
                    value={q.answer as string}
                    onChange={(e) => update(i, { answer: e.target.value })}
                  />
                </label>
                <label>
                  评分标准（满分 1 分）
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    aria-label="评分标准（满分 1 分）"
                    value={q.rubric}
                    onChange={(e) => update(i, { rubric: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <p className="learn-muted">填写 2–5 个选项，并勾选正确答案。</p>
                {q.options.map((o, j) => (
                  <div key={o.value} className="learn-edit-option">
                    <label className="learn-correct-choice">
                      <input
                        aria-label={`第 ${i + 1} 题正确答案 ${o.value}`}
                        type={
                          q.type === "multiple_choice" ? "checkbox" : "radio"
                        }
                        name={`editor-answer-${i}`}
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
                      className="learn-button text"
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
                      删除选项
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="learn-button"
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
                  添加选项
                </button>
              </>
            )}
            <label>
              答案解析
              <textarea
                required
                rows={3}
                maxLength={2000}
                aria-label="答案解析"
                value={q.explanation}
                onChange={(e) => update(i, { explanation: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="learn-button text"
              disabled={questions.length <= 1}
              onClick={() => setQuestions(questions.filter((_, k) => k !== i))}
            >
              删除此题
            </button>
          </fieldset>
        ))}
        <div className="learn-actions">
          <button
            type="button"
            className="learn-button"
            disabled={busy || questions.length >= 3}
            onClick={() => setQuestions([...questions, blankQuestion()])}
          >
            添加题目
          </button>
          <button
            type="submit"
            className="learn-button primary"
            disabled={busy}
          >
            {busy ? "保存中…" : "保存课时修改"}
          </button>
          <button
            type="button"
            className="learn-button"
            disabled={busy}
            onClick={onCancel}
          >
            取消本次编辑
          </button>
        </div>
      </form>
    </section>
  );
}
