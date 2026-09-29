import { useState } from "react";
import type { Attempt, Lesson, Question } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";
import { lessonMastery } from "./mastery";
import { reviewQuestions } from "./study";

export function PracticePanel({
  lesson,
  attempt,
  history,
  disabled,
  onRetry,
  expanded,
  onToggleExpand,
}: {
  lesson: Lesson;
  attempt?: Attempt;
  history: Attempt[];
  disabled: boolean;
  onRetry: (ids: string[]) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [tab, setTab] = useState<"history" | "mistakes">("history");
  const tabs = [
    { id: "history", label: "全部记录" },
    { id: "mistakes", label: "错题本" },
  ] as const;
  return (
    <div className="learn-practice-panel">
      <header className="learn-study-assistant-header learn-practice-header">
        <div className="learn-practice-tabs" role="tablist" aria-label="测验记录分类">
          {tabs.map(({ id, label }, index) => (
            <button
              key={id}
              id={`learn-practice-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`learn-practice-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next].id);
                document.getElementById(`learn-practice-tab-${tabs[next].id}`)?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="learn-tutor-expand"
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          {expanded ? "返回课程" : "展开助手"}
        </button>
      </header>
      <section
        id="learn-practice-panel-history"
        className="learn-practice-section"
        role="tabpanel"
        aria-labelledby="learn-practice-tab-history"
        hidden={tab !== "history"}
        tabIndex={0}
      >
        <PracticeHistory lesson={lesson} attempt={attempt} history={history} />
      </section>
      <section
        id="learn-practice-panel-mistakes"
        className="learn-practice-section"
        role="tabpanel"
        aria-labelledby="learn-practice-tab-mistakes"
        hidden={tab !== "mistakes"}
        tabIndex={0}
      >
        <MistakePanel lesson={lesson} attempt={attempt} disabled={disabled} onRetry={onRetry} />
      </section>
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
    return <PanelEmpty>还没有测验记录，提交测验后会保存在这里。</PanelEmpty>;
  const short = lesson.questions.filter((q) => q.type === "short_answer");
  return (
    <div className="learn-study-panel-body">
      <p className="learn-muted">
        共 {entries.length} 次测验 · 最多保留 8 条历史记录
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
                {short.length ? ` · 简答已保存 ${short.length} 题` : ""}
              </p>
              <p className="learn-muted">
                {mastery.percent === null
                  ? "本次无已判分题目"
                  : `已判分题目掌握参考 ${mastery.percent}%`}
                {mastery.pending ? ` · ${mastery.pending} 道简答未计分` : ""}
              </p>
              <details className="learn-history-answers">
                <summary>查看作答详情</summary>
                {lesson.questions.map((question, questionIndex) => (
                  <AnswerDetail
                    key={question.id}
                    question={question}
                    number={questionIndex + 1}
                    attempt={entry}
                    correct={choice.find((item) => item.questionId === question.id)?.correct}
                  />
                ))}
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

function AnswerDetail({
  question,
  number,
  attempt,
  correct,
}: {
  question: Question;
  number: number;
  attempt: Attempt;
  correct?: boolean | null;
}) {
  const grade = attempt.grades?.[question.id];
  return (
    <section className="learn-answer-detail">
      <strong>{number}. {question.question}</strong>
      <p>我的作答：{answerLabel(question, attempt.answers[question.id])}</p>
      <p className="learn-muted">
        {question.type === "short_answer"
          ? grade
            ? `AI 评分：${grade.score} / ${question.points} 分`
            : "简答未计分"
          : correct
            ? "回答正确"
            : "回答错误"}
      </p>
      <p>参考答案：{answerLabel(question, question.answer)}</p>
      {(grade?.feedback || question.explanation) && (
        <p className="learn-muted">{grade?.feedback || question.explanation}</p>
      )}
    </section>
  );
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
  const choice = gradeChoiceQuestions(lesson.questions, attempt.answers);
  return (
    <div className="learn-study-panel-body">
      <div className="learn-mistake-overview">
        <div className="learn-mistake-overview-row">
          <strong>{questions.length ? `${questions.length} 题待巩固` : "暂无待巩固题目"}</strong>
          {questions.length > 0 && (
            <button
              type="button"
              className="learn-button compact learn-mistake-retry"
              disabled={disabled}
              onClick={() => onRetry(questions.map((q) => q.id))}
            >
              重练错题
            </button>
          )}
        </div>
        <p className="learn-muted">
          {questions.length
            ? "根据本课最近一次测验整理。"
            : "最近一次测验的已判分题目均已答对。"}
          {pending > 0 && `另有 ${pending} 道简答题未计分。`}
        </p>
      </div>
      {questions.map((q) => (
        <AnswerDetail
          key={q.id}
          question={q}
          number={lesson.questions.indexOf(q) + 1}
          attempt={attempt}
          correct={choice.find((item) => item.questionId === q.id)?.correct}
        />
      ))}
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
