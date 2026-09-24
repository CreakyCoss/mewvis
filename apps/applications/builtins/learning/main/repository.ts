import type {
  ApplicationStorage,
  ApplicationStorageValue,
} from "@isle/app-sdk/data";
import {
  checkSize,
  restoreProgress,
  validateCourse,
  type Course,
  type Progress,
} from "./course";

import { projectKey } from "./pbl";

export const courseKey = (id: string) => `learning:course:${id}`;
const progressKey = (id: string) => `learning:progress:${id}`;
export function repository(storage: ApplicationStorage) {
  return {
    async list(): Promise<{ courses: Course[]; warnings: string[] }> {
      const keys = (await storage.keys()).filter((key) =>
        key.startsWith("learning:course:"),
      );
      const courses: Course[] = [];
      const warnings: string[] = [];
      // Read separately to stay below the bridge's response limit.
      for (const key of keys) {
        const raw = await storage.getItem(key);
        try {
          const course = validateCourse(raw);
          if (key !== courseKey(course.id))
            throw new Error("课程标识与存储键不一致");
          courses.push(course);
        } catch (error) {
          warnings.push(
            `${key}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return {
        courses: courses.sort((a, b) => b.createdAt - a.createdAt),
        warnings,
      };
    },
    async save(course: Course) {
      const normalized = validateCourse(course);
      checkSize(normalized);
      await storage.setItem(courseKey(course.id), normalized);
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
    },
  };
}
