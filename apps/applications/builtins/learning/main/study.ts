import type { Attempt, Lesson } from "./course";
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
