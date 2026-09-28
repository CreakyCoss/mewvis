import type { Attempt, Lesson } from "./course";
import { gradeChoiceQuestions } from "./vendor/grading";

/** A study aid based only on the latest answers that have actually been graded. */
export function lessonMastery(lesson: Lesson, attempt: Attempt) {
  const choice = gradeChoiceQuestions(lesson.questions, attempt.answers);
  const choicePoints = lesson.questions
    .filter((question) => question.type !== "short_answer")
    .reduce((sum, question) => sum + question.points, 0);
  let earned = choice.reduce((sum, result) => sum + result.earned, 0);
  let assessed = choicePoints;
  let pending = 0;
  for (const question of lesson.questions) {
    if (question.type !== "short_answer") continue;
    const grade = attempt.grades?.[question.id];
    if (!grade) {
      pending++;
      continue;
    }
    earned += grade.score;
    assessed += question.points;
  }
  return {
    percent: assessed > 0 ? Math.round((earned / assessed) * 100) : null,
    assessed,
    total: lesson.questions.reduce((sum, question) => sum + question.points, 0),
    pending,
  };
}
