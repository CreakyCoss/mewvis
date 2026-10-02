import type {
  ApplicationStorage,
  ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import {
  checkSize,
  restoreProgress,
  validateCourse,
  type Course,
  type Progress,
} from "./course";

import { projectKey } from "./pbl";
import { assistantHistoryKey } from "./assistantHistory";
import {
  type CourseEntry,
  type Draft,
  validateDraft,
  writeDraft,
} from "./workflow";

export const courseKey = (id: string) => `learning:course:${id}`;
const progressKey = (id: string) => `learning:progress:${id}`;
const dataVersionKey = "learning:data-version";
const dataVersion = "course-flow-v5";
const entryId = (entry: CourseEntry) =>
  entry.status === "stashed" ? entry.courseId : entry.id;
export const sortCourseEntries = (entries: CourseEntry[]): CourseEntry[] =>
  [...entries].sort(
    (a, b) => a.createdAt - b.createdAt || entryId(a).localeCompare(entryId(b)),
  );
export const upsertCourseEntry = (
  entries: CourseEntry[],
  saved: CourseEntry,
): CourseEntry[] =>
  sortCourseEntries([
    ...entries.filter((entry) => entryId(entry) !== entryId(saved)),
    saved,
  ]);

export function repository(storage: ApplicationStorage) {
  return {
    async initialize(removeOldChats: () => Promise<void>) {
      if ((await storage.getItem(dataVersionKey)) === dataVersion) return;
      // This release starts a new course library. The application's storage is
      // scoped to learning, so clear every previous business key, including
      // keys that older releases used outside the current course namespace.
      await storage.clear();
      await removeOldChats();
      await storage.setItem(dataVersionKey, dataVersion);
    },
    async list(): Promise<CourseEntry[]> {
      const keys = (await storage.keys()).filter((key) =>
        key.startsWith("learning:course:"),
      );
      const courses: CourseEntry[] = [];
      // Read separately to stay below the bridge's response limit.
      for (const key of keys) {
        const raw = await storage.getItem(key);
        const course =
          (raw as { status?: unknown } | null)?.status === "stashed"
            ? validateDraft(raw)
            : validateCourse(raw);
        const id = course.status === "stashed" ? course.courseId : course.id;
        if (key !== courseKey(id)) throw new Error("课程标识与存储键不一致");
        courses.push(course);
      }
      return sortCourseEntries(courses);
    },
    async save(course: Course) {
      const normalized = validateCourse(course);
      checkSize(normalized);
      await storage.setItem(courseKey(course.id), normalized);
    },
    async saveDraft(draft: Draft): Promise<Draft> {
      return writeDraft(storage, draft, courseKey(draft.courseId));
    },
    async progress(course: Course) {
      return restoreProgress(
        course,
        await storage.getItem(progressKey(course.id)),
      );
    },
    async saveProgress(course: Course, progress: Progress) {
      await storage.setItem(
        progressKey(course.id),
        restoreProgress(course, progress) as unknown as ApplicationStorageValue,
      );
    },
    async remove(id: string) {
      // Remove the visible document first; an orphaned progress key is harmless on failure.
      await storage.removeItem(courseKey(id));
      await storage.removeItem(progressKey(id));
      await storage.removeItem(projectKey(id));
      await storage.removeItem(assistantHistoryKey(id));
    },
  };
}
