import { useRef, useState } from "react";
import { type Attempt, type Answers, type Lesson, validAnswer } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";
import { Notice, errorText } from "./components";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import { gradingProfile, gradingPrompt, parseGrades } from "./workflow";
import { lessonMastery } from "./mastery";

export function Quiz({
  lesson,
  attempt,
  history,
  onSubmit,
  disabled,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  history: Attempt[];
  onSubmit: (attempt: Attempt) => Promise<void>;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>(attempt?.answers ?? {});
  const [retrying, setRetrying] = useState(false);
  const [retryWeak, setRetryWeak] = useState(false);
  const [retryQuestionIds, setRetryQuestionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const saved = attempt && !retrying ? attempt : null;
  const results = saved
    ? gradeChoiceQuestions(lesson.questions, saved.answers)
    : [];
  const mastery = saved ? lessonMastery(lesson, saved) : null;
  const weakIds = saved
    ? lesson.questions
        .filter((q) =>
          q.type === "short_answer"
            ? (saved.grades?.[q.id]?.score ?? -1) < q.points
            : !results.find((result) => result.questionId === q.id)?.correct,
        )
        .map((q) => q.id)
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
  const connectGrading = async () => {
    if (!saved) return;
    const ref = await createModelTask(gradingProfile);
    try {
      await onSubmit({ ...saved, gradingSession: ref });
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const beginRetry = async (onlyWeak: boolean) => {
    if (!saved) return;
    if (saved.gradingSession) await closeModelTask(saved.gradingSession);
    setRetryWeak(onlyWeak);
    setRetryQuestionIds(onlyWeak ? weakIds : []);
    setAnswers(
      onlyWeak
        ? Object.fromEntries(
            Object.entries(saved.answers).filter(
              ([id]) => !weakIds.includes(id),
            ),
          )
        : {},
    );
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
          {lesson.questions.length} 道题 · 共 {lesson.questions.reduce((sum, question) => sum + question.points, 0)} 分
        </span>
      </div>
      {mastery && (
        <p className="learn-muted">
          最近一次掌握参考：
          {mastery.percent === null ? "待评分" : `${mastery.percent}%`}
          {`（按已评分 ${mastery.assessed}/${mastery.total} 分估算`}
          {mastery.pending > 0 ? `，${mastery.pending} 道简答待评` : ""}）
        </p>
      )}
      {retrying && retryWeak && (
        <p className="learn-muted">
          只显示需要再练的题目；已掌握题目的答案沿用上次作答。
        </p>
      )}
      {visibleQuestions.map((q) => {
        const index = lesson.questions.indexOf(q);
        const value = answers[q.id];
        const result = results.find((r) => r.questionId === q.id);
        const grade = saved?.grades?.[q.id];
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
                className={`learn-answer ${result?.correct || grade?.score === q.points ? "correct" : "incorrect"}`}
              >
                <strong>
                  {q.type === "short_answer"
                    ? grade
                      ? `AI 评分：${grade.score} / ${q.points} 分`
                      : "作答已保存 · 待 AI 评分"
                    : result?.correct
                      ? "回答正确"
                      : `正确答案：${Array.isArray(q.answer) ? q.answer.join("、") : q.answer}`}
                </strong>
                {grade && <p>{grade.feedback}</p>}
                <p>{q.explanation}</p>
                {q.type === "short_answer" && (
                  <details>
                    <summary>参考答案与评分标准</summary>
                    <p>{q.answer}</p>
                    <p>{q.rubric}</p>
                  </details>
                )}
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
              {results.length} · 简答已评分{" "}
              {short.filter((q) => saved.grades?.[q.id]).length} /{" "}
              {short.length}
            </span>
            {weakIds.length > 0 && (
              <button
                className="learn-button primary"
                disabled={blocked}
                onClick={() => void run(() => beginRetry(true))}
              >
                只练需巩固的 {weakIds.length} 题
              </button>
            )}
            <button
              className="learn-button"
              disabled={blocked}
              onClick={() => void run(() => beginRetry(false))}
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
      {saved && short.length > 0 && (
        <section className="learn-grading">
          <p className="learn-muted">
            AI
            评分仅供学习参考。评分会向所选模型发送本课讲解、题目、参考答案和本次作答；失败可重试，已保存的答案不会丢失。
          </p>
          {!saved.gradingSession ? (
            <button
              className="learn-button"
              disabled={blocked}
              onClick={() => void run(connectGrading)}
            >
              连接 AI 评阅
            </button>
          ) : (
            <div inert={blocked}>
              <ModelTask
                key={`${saved.submittedAt}:${saved.gradingSession.chatId}`}
                taskRef={saved.gradingSession}
                title="简答题 AI 评阅"
                prompt={gradingPrompt(lesson, saved)}
                preview={(raw) => (
                  <ul>
                    {Object.entries(parseGrades(raw, lesson, saved)).map(
                      ([id, grade]) => (
                        <li key={id}>
                          {lesson.questions.find((q) => q.id === id)?.question}
                          ：{grade.score} 分 · {grade.feedback}
                        </li>
                      ),
                    )}
                  </ul>
                )}
                onAccept={(raw) =>
                  exclusive(() =>
                    onSubmit({
                      ...saved,
                      grades: parseGrades(raw, lesson, saved),
                    }),
                  )
                }
                onRetryConnection={() => exclusive(connectGrading)}
              />
            </div>
          )}
        </section>
      )}
      {attempt && (
        <details className="learn-attempt-history">
          <summary>练习记录 · 共 {history.length + 1} 次</summary>
          <p className="learn-muted">
            每课最多保留 8 条先前记录；空间不足时移除最旧记录。
          </p>
          <ol>
            {[attempt, ...history].map((entry, index) => {
              const choice = gradeChoiceQuestions(
                lesson.questions,
                entry.answers,
              );
              const mastery = lessonMastery(lesson, entry);
              const reviewed = short.filter((q) => entry.grades?.[q.id]).length;
              return (
                <li key={entry.submittedAt}>
                  <span>
                    {index === 0
                      ? "最近一次"
                      : `第 ${history.length + 1 - index} 次`}
                  </span>
                  <span>
                    {new Date(entry.submittedAt).toLocaleString("zh-CN")}
                  </span>
                  <span>
                    选择题 {choice.filter((r) => r.correct).length}/
                    {choice.length}
                    {short.length > 0
                      ? ` · 简答已评 ${reviewed}/${short.length}`
                      : ""}
                    {` · 掌握参考 ${mastery.percent === null ? "待评分" : `${mastery.percent}%`}`}
                    {mastery.pending > 0 ? `（${mastery.pending} 题待评）` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
