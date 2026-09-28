import { useRef, useState } from "react";
import { type Attempt, type Answers, type Lesson, validAnswer } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";
import { Notice, errorText } from "./components";

export function Quiz({
  lesson,
  attempt,
  retryIds,
  onSubmit,
  onReset,
  disabled,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  retryIds?: string[];
  onSubmit: (attempt: Attempt) => Promise<void>;
  onReset: () => Promise<void>;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>(() =>
    retryIds && attempt
      ? Object.fromEntries(
          Object.entries(attempt.answers).filter(
            ([id]) => !retryIds.includes(id),
          ),
        )
      : (attempt?.answers ?? {}),
  );
  const [retrying, setRetrying] = useState(!!retryIds);
  const [retryWeak, setRetryWeak] = useState(!!retryIds);
  const [retryQuestionIds, setRetryQuestionIds] = useState<string[]>(
    retryIds ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const saved = attempt && !retrying ? attempt : null;
  const results = saved
    ? gradeChoiceQuestions(lesson.questions, saved.answers)
    : [];
  const visibleQuestions =
    retrying && retryWeak
      ? lesson.questions.filter((q) => retryQuestionIds.includes(q.id))
      : lesson.questions;
  const short = lesson.questions.filter((q) => q.type === "short_answer");
  const complete = lesson.questions.every((q) => validAnswer(q, answers[q.id]));
  const blocked = disabled || busy;
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
  const beginRetry = async () => {
    if (!saved) return;
    await onReset();
    setRetryWeak(false);
    setRetryQuestionIds([]);
    setAnswers({});
    setRetrying(true);
  };
  return (
    <section className="learn-quiz" aria-label="课后测验">
      <div className="learn-section-title">
        <div>
          <span className="learn-eyebrow">CHECK YOUR UNDERSTANDING</span>
          <h2>用练习，检验理解</h2>
        </div>
        <span className="learn-chip">
          {lesson.questions.length} 道题 · 共{" "}
          {lesson.questions.reduce((sum, question) => sum + question.points, 0)}{" "}
          分
        </span>
      </div>
      {retrying && retryWeak && (
        <p className="learn-muted">
          只显示需要再练的题目；已掌握题目的答案沿用上次作答。
        </p>
      )}
      {visibleQuestions.map((q) => {
        const index = lesson.questions.indexOf(q);
        const value = answers[q.id];
        const result = results.find((r) => r.questionId === q.id);
        return (
          <fieldset key={q.id} disabled={blocked || !!saved}>
            <legend>
              {index + 1}. {q.question}{" "}
              <small>
                （
                {q.type === "short_answer"
                  ? "简答"
                  : q.type === "multiple_choice"
                    ? "多选"
                    : "单选"}{" "}
                · {q.points} 分）
              </small>
            </legend>
            {q.type === "short_answer" ? (
              <textarea
                aria-label={`第 ${index + 1} 题作答`}
                rows={5}
                maxLength={2000}
                value={typeof value === "string" ? value : ""}
                placeholder="用自己的话回答，最多 2,000 字"
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
              />
            ) : (
              <div className="learn-options">
                {q.options.map((option) => {
                  const checked = Array.isArray(value)
                    ? value.includes(option.value)
                    : value === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`learn-option ${checked ? "selected" : ""}`}
                    >
                      <input
                        type={
                          q.type === "multiple_choice" ? "checkbox" : "radio"
                        }
                        name={q.id}
                        checked={checked}
                        onChange={() =>
                          setAnswers((current) => {
                            const previous = Array.isArray(current[q.id])
                              ? (current[q.id] as string[])
                              : [];
                            return {
                              ...current,
                              [q.id]:
                                q.type === "multiple_choice"
                                  ? checked
                                    ? previous.filter((v) => v !== option.value)
                                    : [...previous, option.value]
                                  : option.value,
                            };
                          })
                        }
                      />
                      <span className="learn-option-letter">
                        {option.value}
                      </span>
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {saved && (
              <div
                className={`learn-answer ${q.type === "short_answer" ? "saved" : result?.correct ? "correct" : "incorrect"}`}
              >
                <strong>
                  {q.type === "short_answer"
                    ? "作答已保存"
                    : result?.correct
                      ? "回答正确"
                      : `正确答案：${Array.isArray(q.answer) ? q.answer.join("、") : q.answer}`}
                </strong>
                {q.type !== "short_answer" && <p>{q.explanation}</p>}
              </div>
            )}
          </fieldset>
        );
      })}
      {error && <Notice>{error}</Notice>}
      <div className="learn-actions learn-quiz-actions">
        {saved ? (
          <>
            <span className="learn-muted">
              选择题答对 {results.filter((r) => r.correct).length} /{" "}
              {results.length}
              {short.length > 0 ? ` · 简答已保存 ${short.length} 题` : ""}
            </span>
            <button
              className="learn-button"
              disabled={blocked}
              onClick={() => void run(() => beginRetry())}
            >
              全部再练
            </button>
          </>
        ) : (
          <button
            className="learn-button primary"
            disabled={blocked || !complete}
            onClick={() =>
              void run(async () => {
                await onSubmit({
                  answers,
                  submittedAt: Math.max(
                    Date.now(),
                    (attempt?.submittedAt ?? 0) + 1,
                  ),
                });
                setRetrying(false);
                setRetryWeak(false);
                setRetryQuestionIds([]);
              })
            }
          >
            {blocked ? "保存中…" : "提交答案"}
          </button>
        )}
      </div>
    </section>
  );
}
