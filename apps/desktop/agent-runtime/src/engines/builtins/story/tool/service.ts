import type { StoryProjectApi } from "../../../../../../protocols/story-project/index.js";
import type { StoryToolRepository } from "./repository.js";
import {
  type StoryCommitChangesResult,
  type StoryInitializeResult,
  type StoryStructureDescription,
  type StoryToolApi,
  type StoryValidateChangesResult,
} from "../protocol.js";

const storyToolStructure = (projectApi: StoryProjectApi): StoryStructureDescription => ({
  compiler: projectApi.compiler,
  profile: projectApi.describe(),
  changeSet: projectApi.changeSet,
  rules: [
    "工具只消费受信任 StoryProjectCompiler 的编译结果；工作区 profile.json 定义文档结构，project.json 只映射目录。",
    "Story Tool 只依赖版本化 Story Project Protocol，不绑定具体 Compiler、存储方式或默认协议身份。",
    "Compiler 按工作区 Profile 快照负责初始化、项目装配、上下文、ChangeSet 和校验；工具只负责安全 IO 与原子提交。",
    "正式写入必须通过 story(action=commit_changes)；校验失败时不得修改磁盘。",
    "每批提交成功后必须重新读取 revision，再构造下一批 ChangeSet。",
  ],
});

const invalidIssue = (error: unknown) => ({
  severity: "error" as const,
  code: "changeset.invalid",
  path: "changeSet",
  message: error instanceof Error ? error.message : String(error),
});

export const createStoryToolService = (repository: StoryToolRepository): StoryToolApi => {
  const loadProjectApi = () => repository.loadProjectApi();

  return {
    async describeStructure() {
      const projectApi = await loadProjectApi();
      return { available: true, structure: storyToolStructure(projectApi) };
    },

    async initialize(input): Promise<StoryInitializeResult> {
      try {
        const projectApi = await loadProjectApi();
        const manifestPath = projectApi.projectManifestPath();
        const status = await repository.inspect(projectApi);
        if (status.initialized) {
          const current = await repository.load(projectApi);
          return {
            initialized: false,
            alreadyInitialized: true,
            revision: projectApi.projectInfo(current).revision,
            manifestPath,
            existingJsonPaths: status.jsonPaths,
            issues: [],
            hint: "故事工具结构已经初始化，请先读取上下文再增量提交。",
          };
        }
        if (status.jsonPaths.length > 0 && !input.replaceExistingJson) {
          return {
            initialized: false,
            alreadyInitialized: false,
            revision: null,
            manifestPath,
            existingJsonPaths: status.jsonPaths,
            issues: [
              {
                severity: "error",
                code: "initialize.existing-json",
                path: "story",
                message: "story 目录已有不受当前 Compiler 管理的 JSON；明确允许替换后才能初始化。",
              },
            ],
            hint: "确认这些普通 JSON 可以被替换后，将 replaceExistingJson 设为 true 重试。",
          };
        }
        const project = projectApi.createProject({ storyId: input.storyId, title: input.title });
        const validation = projectApi.validateProject(project, "draft");
        if (!validation.valid) {
          throw new Error(validation.issues.map((item) => `${item.path}：${item.message}`).join("\n"));
        }
        await repository.initialize(projectApi, project, input.replaceExistingJson === true);
        return {
          initialized: true,
          alreadyInitialized: false,
          revision: projectApi.projectInfo(project).revision,
          manifestPath,
          existingJsonPaths: status.jsonPaths,
          issues: validation.issues,
          hint: null,
        };
      } catch (error) {
        return {
          initialized: false,
          alreadyInitialized: false,
          revision: null,
          manifestPath: null,
          existingJsonPaths: [],
          issues: [invalidIssue(error)],
          hint: "未创建任何正式故事文件。请修正协议或初始化参数后重试。",
        };
      }
    },

    async readContext(input) {
      const projectApi = await loadProjectApi();
      return projectApi.readContext(await repository.load(projectApi), input);
    },

    async validateChanges(input): Promise<StoryValidateChangesResult> {
      try {
        const projectApi = await loadProjectApi();
        const applied = projectApi.applyChanges(await repository.load(projectApi), input.changeSet);
        return {
          valid: applied.validation.valid,
          nextRevision: applied.nextRevision,
          issues: applied.validation.issues,
          batch: applied.batch,
          operationTypes: applied.operationTypes,
          changedPaths: applied.changedPaths,
        };
      } catch (error) {
        return {
          valid: false,
          nextRevision: null,
          issues: [invalidIssue(error)],
          batch: null,
          operationTypes: [],
          changedPaths: [],
        };
      }
    },

    async commitChanges(input): Promise<StoryCommitChangesResult> {
      try {
        const projectApi = await loadProjectApi();
        const applied = projectApi.applyChanges(await repository.load(projectApi), input.changeSet);
        await repository.writeChanges(projectApi, applied.project, applied.changedPaths);
        return {
          committed: true,
          valid: true,
          revision: applied.nextRevision,
          batch: applied.batch,
          operationTypes: applied.operationTypes,
          changedPaths: applied.changedPaths,
          validation: applied.validation,
          issues: applied.validation.issues,
          hint: null,
        };
      } catch (error) {
        return {
          committed: false,
          valid: false,
          revision: null,
          batch: null,
          operationTypes: [],
          changedPaths: [],
          validation: null,
          issues: [invalidIssue(error)],
          hint: "正式文件未修改。请读取最新 revision，并只修正当前小批次后重新提交。",
        };
      }
    },
  };
};
