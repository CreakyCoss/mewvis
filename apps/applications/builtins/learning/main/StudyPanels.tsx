import { useRef, useState } from "react";
import type { Attempt, Lesson, Question } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";
import { lessonMastery } from "./mastery";
import { Notice, TutorConversation, errorText } from "./components";
import { Chat } from "@isle/app-sdk/chat/react";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import { gradingProfile, gradingPrompt, parseGrades } from "./workflow";
import { reviewQuestions } from "./study";

type Props = {
  lesson: Lesson;
  attempt?: Attempt;
  disabled: boolean;
  onSubmit: (attempt: Attempt) => Promise<void>;
};

export function GradingPanel({ lesson, attempt, disabled, onSubmit }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const short = lesson.questions.filter((q) => q.type === "short_answer");
  const exclusive = async (action: () => Promise<void>) => {
    if (lock.current || disabled) throw new Error("正在保存，请稍后重试");
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const connect = async () => {
    if (!attempt) return;
    const ref = await createModelTask(gradingProfile);
    try {
      await onSubmit({ ...attempt, gradingSession: ref });
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  if (!short.length)
    return <PanelEmpty>本课没有简答题，选择题会在提交后直接判断。</PanelEmpty>;
  if (!attempt)
    return <PanelEmpty>先完成并提交本课测验，再来评阅简答题。</PanelEmpty>;
  return (
    <div className="learn-study-panel-body">
      <p className="learn-muted">
        AI 评阅会参考本课讲解、题目、评分标准和本次作答，结果仅供学习参考。
      </p>
      {error && <Notice>{error}</Notice>}
      {short.map((q) => {
        const grade = attempt.grades?.[q.id];
        return (
          <section className="learn-review-item" key={q.id}>
            <div className="learn-review-heading">
              <strong>{q.question}</strong>
              <span>
                {grade ? `${grade.score} / ${q.points} 分` : "待评阅"}
              </span>
            </div>
            <p className="learn-muted">我的作答</p>
            <p>{String(attempt.answers[q.id] ?? "未作答")}</p>
            {grade && <p className="learn-review-feedback">{grade.feedback}</p>}
            <details>
              <summary>参考答案与评分标准</summary>
              <p>{q.answer}</p>
              <p>{q.rubric}</p>
              <p>{q.explanation}</p>
            </details>
          </section>
        );
      })}
      {!attempt.gradingSession ? (
        <button
          className="learn-button primary"
          disabled={disabled || busy}
          onClick={() => {
            setError("");
            void exclusive(connect).catch((e) => setError(errorText(e)));
          }}
        >
          {busy ? "连接中…" : "连接 AI 评阅"}
        </button>
      ) : (
        <div inert={disabled || busy}>
          <ModelTask
            embedded
            renderChat={(session) => (
              <Chat.Provider session={session} viewId="learning-review">
                <TutorConversation lesson={lesson} reviewing />
              </Chat.Provider>
            )}
            key={`${attempt.submittedAt}:${attempt.gradingSession.chatId}`}
            taskRef={attempt.gradingSession}
            title="简答题 AI 评阅"
            prompt={gradingPrompt(lesson, attempt)}
            preview={(raw) => (
              <ul>
                {Object.entries(parseGrades(raw, lesson, attempt)).map(
                  ([id, grade]) => (
                    <li key={id}>
                      {lesson.questions.find((q) => q.id === id)?.question}：
                      {grade.score} 分 · {grade.feedback}
                    </li>
                  ),
                )}
              </ul>
            )}
            onAccept={(raw) =>
              exclusive(() =>
                onSubmit({
                  ...attempt,
                  grades: parseGrades(raw, lesson, attempt),
                }),
              )
            }
            onRetryConnection={() => exclusive(connect)}
          />
        </div>
      )}
    </div>
  );
}

export function PracticeHistory({
  lesson,
  attempt,
  history,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  history: Attempt[];
}) {
  const entries = attempt ? [attempt, ...history] : history;
  if (!entries.length)
    return <PanelEmpty>还没有练习记录，提交测验后会保存在这里。</PanelEmpty>;
  const short = lesson.questions.filter((q) => q.type === "short_answer");
  return (
    <div className="learn-study-panel-body">
      <p className="learn-muted">
        共 {entries.length} 次练习 · 最多保留 8 条历史记录
      </p>
      <ol className="learn-practice-list">
        {entries.map((entry, index) => {
          const choice = gradeChoiceQuestions(lesson.questions, entry.answers);
          const mastery = lessonMastery(lesson, entry);
          return (
            <li key={entry.submittedAt}>
              <strong>
                {index === 0 ? "最近一次" : `第 ${entries.length - index} 次`}
              </strong>
              <time>{new Date(entry.submittedAt).toLocaleString("zh-CN")}</time>
              <p>
                选择题答对 {choice.filter((r) => r.correct).length} /{" "}
                {choice.length}
                {short.length
                  ? ` · 简答已评 ${short.filter((q) => entry.grades?.[q.id]).length} / ${short.length}`
                  : ""}
              </p>
              <p className="learn-muted">
                掌握参考{" "}
                {mastery.percent === null ? "待评分" : `${mastery.percent}%`}
                {mastery.pending ? ` · ${mastery.pending} 题待评` : ""}
              </p>
              <details className="learn-history-answers">
                <summary>查看作答详情</summary>
                {lesson.questions.map((question, questionIndex) => {
                  const result = choice.find(
                    (item) => item.questionId === question.id,
                  );
                  const grade = entry.grades?.[question.id];
                  return (
                    <section key={question.id}>
                      <strong>
                        {questionIndex + 1}. {question.question}
                      </strong>
                      <p>
                        当时作答：
                        {answerLabel(question, entry.answers[question.id])}
                      </p>
                      <p className="learn-muted">
                        {question.type === "short_answer"
                          ? grade
                            ? `AI 评分：${grade.score} / ${question.points} 分`
                            : "当次尚未评阅"
                          : result?.correct
                            ? "回答正确"
                            : "回答错误"}
                      </p>
                      {grade && <p>{grade.feedback}</p>}
                      <p className="learn-muted">
                        参考答案：{answerLabel(question, question.answer)}
                      </p>
                    </section>
                  );
                })}
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function answerLabel(
  question: Question,
  answer: string | string[] | undefined,
) {
  if (answer === undefined) return "未作答";
  if (question.type === "short_answer") return String(answer);
  return (Array.isArray(answer) ? answer : [answer])
    .map((value) => {
      const option = question.options.find((item) => item.value === value);
      return option ? `${value}. ${option.label}` : value;
    })
    .join("；");
}

export function MistakePanel({
  lesson,
  attempt,
  disabled,
  onRetry,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  disabled: boolean;
  onRetry: (ids: string[]) => void;
}) {
  if (!attempt)
    return (
      <PanelEmpty>提交测验后，答错和需要巩固的题目会整理在这里。</PanelEmpty>
    );
  const questions = reviewQuestions(lesson, attempt);
  const pending = lesson.questions.filter(
    (q) => q.type === "short_answer" && !attempt.grades?.[q.id],
  ).length;
  return (
    <div className="learn-study-panel-body">
      <p className="learn-muted">
        本课最近一次作答 · {questions.length} 题需巩固
      </p>
      {pending > 0 && (
        <p className="learn-muted">{pending} 道简答题待评阅，暂不计入错题。</p>
      )}
      {!questions.length && <p>已判分的题目均已答对。</p>}
      {questions.map((q) => (
        <section className="learn-review-item" key={q.id}>
          <strong>
            {lesson.questions.indexOf(q) + 1}. {q.question}
          </strong>
          <p className="learn-muted">
            我的作答：
            {Array.isArray(attempt.answers[q.id])
              ? (attempt.answers[q.id] as string[]).join("、")
              : attempt.answers[q.id]}
          </p>
          <p>
            参考答案：{Array.isArray(q.answer) ? q.answer.join("、") : q.answer}
          </p>
          <p>{attempt.grades?.[q.id]?.feedback ?? q.explanation}</p>
        </section>
      ))}
      {questions.length > 0 && (
        <button
          className="learn-button primary"
          disabled={disabled}
          onClick={() => onRetry(questions.map((q) => q.id))}
        >
          只练需巩固的 {questions.length} 题
        </button>
      )}
    </div>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="learn-panel-empty">
      <p>{children}</p>
    </div>
  );
}
