import { ZodError } from "zod";
import type { StoryProjectApi } from "../../../../../../protocols/story-project/index.js";
import type { StoryToolRepository } from "./repository.js";
import { normalizeStoryChangeSet } from "./request.js";
import {
  type StoryCommitChangesResult,
  type StoryDescribeStructureRequest,
  type StoryInitializeResult,
  type StoryStructureDescription,
  type StoryToolApi,
  type StoryValidateChangesResult,
} from "../protocol.js";

const referencedObjectDefinitions = (
  profile: ReturnType<StoryProjectApi["describe"]>,
  documents: StoryStructureDescription["schemas"]["documents"],
) => {
  const names = new Set<string>();
  const visitFields = (fields: Readonly<Record<string, { definition?: string; itemDefinition?: string }>>) => {
    for (const field of Object.values(fields)) {
      for (const name of [field.definition, field.itemDefinition]) {
        if (!name || names.has(name)) continue;
        names.add(name);
        const definition = profile.objectDefinitions[name];
        if (definition) visitFields(definition.fields);
      }
    }
  };
  for (const document of Object.values(documents)) visitFields(document.fields);
  return Object.fromEntries(
    [...names].flatMap((name) => (profile.objectDefinitions[name] ? [[name, profile.objectDefinitions[name]]] : [])),
  );
};

const storyToolStructure = (
  projectApi: StoryProjectApi,
  input: StoryDescribeStructureRequest = {},
): StoryStructureDescription => {
  const profile = projectApi.describe();
  const documentKinds = [...new Set(input.documentKinds ?? [])];
  const schemaDocuments = Object.fromEntries(
    documentKinds.map((kind) => [kind, { ...projectApi.document(kind), fields: projectApi.documentFields(kind) }]),
  );
  return {
    compiler: projectApi.compiler,
    profile: {
      $format: profile.$format,
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      schemaVersion: profile.schemaVersion,
      rootPath: profile.rootPath,
      manifestKind: profile.manifestKind,
      ...(profile.primaryKind ? { primaryKind: profile.primaryKind } : {}),
      documentRoles: profile.documentRoles,
      documents: Object.fromEntries(
        Object.entries(profile.documents).map(([kind, document]) => [
          kind,
          {
            label: document.label,
            ...(document.description ? { description: document.description } : {}),
            ...(document.contentType ? { contentType: document.contentType } : {}),
            layoutPresence: document.layoutPresence,
            pathPattern: document.pathPattern,
            cardinality: document.cardinality,
          },
        ]),
      ),
      contextViews: Object.fromEntries(
        Object.entries(
          profile.contextViews as Readonly<
            Record<
              string,
              { label: string; scope: "project" | "chapter"; targetKind?: string; documentKinds: readonly string[] }
            >
          >,
        ).map(([name, view]) => [
          name,
          {
            label: view.label,
            scope: view.scope,
            ...(view.targetKind ? { targetKind: view.targetKind } : {}),
            documentKinds: view.documentKinds,
          },
        ]),
      ),
      validationProfiles: Object.keys(profile.validationProfiles),
    },
    schemas: {
      documents: schemaDocuments,
      objectDefinitions: referencedObjectDefinitions(profile, schemaDocuments),
    },
    changeSet: projectApi.changeSet,
    rules: [
      "工具只消费受信任 StoryProjectCompiler 的编译结果；工作区 profile.json 定义文档结构，project.json 只映射目录。",
      "首次 describe_structure 返回轻量目录；写入前用 documentKinds 只请求当前批次需要的字段和嵌套对象定义。",
      "Compiler 按工作区 Profile 快照负责初始化、项目装配、上下文、ChangeSet 和校验；工具只负责安全 IO 与原子提交。",
      "正式写入必须通过 story(action=commit_changes)；校验失败时不得修改磁盘。",
      "每批提交成功后必须重新读取 revision，再构造下一批 ChangeSet。",
    ],
  };
};

const zodPath = (owner: string, path: PropertyKey[]) =>
  path.reduce<string>(
    (result, segment) =>
      typeof segment === "number"
        ? `${String(result)}[${String(segment)}]`
        : result
          ? `${String(result)}.${String(segment)}`
          : String(segment),
    owner,
  );

const invalidIssues = (error: unknown, owner = "changeSet", code = "changeset.invalid") => {
  if (error instanceof ZodError) {
    return error.issues.map((item) => ({
      severity: "error" as const,
      code: `${code}.${item.code}`,
      path: zodPath(owner, item.path),
      message: item.message,
    }));
  }
  return [
    {
      severity: "error" as const,
      code,
      path: owner,
      message: error instanceof Error ? error.message : String(error),
    },
  ];
};

export const createStoryToolService = (repository: StoryToolRepository): StoryToolApi => {
  const loadProjectApi = () => repository.loadProjectApi();

  return {
    async describeStructure(input) {
      const projectApi = await loadProjectApi();
      return { available: true, structure: storyToolStructure(projectApi, input) };
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
          issues: invalidIssues(error, "initialize", "initialize.invalid"),
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
        const applied = projectApi.applyChanges(
          await repository.load(projectApi),
          normalizeStoryChangeSet(input.changeSet),
        );
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
          issues: invalidIssues(error),
          batch: null,
          operationTypes: [],
          changedPaths: [],
        };
      }
    },

    async commitChanges(input): Promise<StoryCommitChangesResult> {
      try {
        const projectApi = await loadProjectApi();
        const applied = projectApi.applyChanges(
          await repository.load(projectApi),
          normalizeStoryChangeSet(input.changeSet),
        );
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
          issues: invalidIssues(error),
          hint: "正式文件未修改。请读取最新 revision，并只修正当前小批次后重新提交。",
        };
      }
    },
  };
};
