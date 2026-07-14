import type { StoryValidationIssue } from "../types.js";

export const storyValidationIssue = (code: string, path: string, message: string): StoryValidationIssue => ({
  severity: "error",
  code,
  path,
  message,
});

/** 声明式 Compiler 内部使用的结构化校验异常。 */
export class DeclarativeStoryValidationError extends Error {
  constructor(readonly issues: StoryValidationIssue[]) {
    super(issues.map((item) => `${item.path}：${item.message}`).join("\n"));
    this.name = "DeclarativeStoryValidationError";
  }
}
