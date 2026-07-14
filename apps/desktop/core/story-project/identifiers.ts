/**
 * Story Project 协议族使用的稳定身份。
 *
 * 这些值用于跨模块识别协议、输入格式和 Compiler，不代表某一本书或某套
 * 业务 Profile。修改任一身份都等价于引入新的协议格式，应新增身份而不是
 * 直接覆盖旧值。
 */
export const STORY_PROJECT_IDENTIFIERS = Object.freeze({
  /** Compiler 最终必须实现的标准 StoryProjectApi 协议。 */
  projectApi: Object.freeze({
    id: "novel-claw.story-project",
    version: 1,
  }),

  /** 默认声明式 Compiler 接受的 Profile JSON 格式及其结构版本。 */
  declarativeProfile: Object.freeze({
    format: "novel-claw.story-profile",
    schemaVersion: 1,
  }),

  /** 将声明式 Profile 与 Layout 编译为 StoryProjectApi 的受信任 Compiler。 */
  declarativeCompiler: Object.freeze({
    format: "novel-claw.declarative-story-project",
    version: 1,
  }),

  /** 工作区 project.lock.json 的文件格式及其结构版本。 */
  projectLock: Object.freeze({
    format: "novel-claw.story-project-lock",
    version: 1,
  }),
});
