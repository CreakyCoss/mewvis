import type { Attempt, Lesson, Question } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";

/** Unreviewed short answers are pending, not mistakes. */
export function reviewQuestions(lesson: Lesson, attempt: Attempt) {
  const choices = gradeChoiceQuestions(lesson.questions, attempt.answers);
  return lesson.questions.filter((q) =>
    q.type === "short_answer"
      ? !!attempt.grades?.[q.id] && attempt.grades[q.id].score < q.points
      : choices.some((result) => result.questionId === q.id && !result.correct),
  );
}

export function assertCurrentReview(
  current: Attempt | undefined,
  review: Attempt,
) {
  if (!current || current.submittedAt !== review.submittedAt)
    throw new Error("作答已更新，请评阅最新一次练习");
}

export function questionAnalysisPrompt(
  lesson: Lesson,
  question: Question,
  index: number,
  answer: string | string[] | undefined,
): string {
  const type = question.type === "short_answer"
    ? "简答题"
    : question.type === "multiple_choice"
      ? "多选题"
      : "单选题";
  const options = question.type === "short_answer"
    ? []
    : ["选项：", ...question.options.map((option) => `${option.value}. ${option.label}`)];
  const selected = Array.isArray(answer)
    ? answer.length ? answer.join("、") : "尚未作答"
    : answer?.trim() || "尚未作答";
  return [
    `请解析《${lesson.title}》第 ${index + 1} 题（${type}）。`,
    `题目：${question.question}`,
    ...options,
    `我的作答：${selected}`,
    "请结合本课内容说明正确答案或作答要点、判断依据与常见误区。如果我已作答，请针对我的答案指出正确之处和需要改进的地方；如果尚未作答，直接讲解即可。不要给简答题编造分数。",
  ].join("\n");
}
