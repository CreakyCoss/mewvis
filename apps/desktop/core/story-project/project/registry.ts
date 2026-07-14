import { assertProtocolImplementation, defineProtocol } from "../../protocol.js";
import { STORY_PROJECT_IDENTIFIERS } from "../identifiers.js";
import type { StoryProjectApi, StoryProjectCompilerRegistry } from "../api.js";

type StoryProjectCompiler = Parameters<StoryProjectCompilerRegistry["register"]>[0];

const STORY_PROJECT_API_DEFINITION = defineProtocol<StoryProjectApi>()({
  id: STORY_PROJECT_IDENTIFIERS.projectApi.id,
  version: STORY_PROJECT_IDENTIFIERS.projectApi.version,
  properties: {
    compiler: { description: "实际编译工作区 contract 的受信任 Compiler 身份" },
    identity: { description: "当前故事项目 contract 的稳定身份" },
    changeSet: { description: "增量变更限制与支持的操作" },
  },
  methods: {
    describe: { description: "返回标准化后的故事项目结构" },
    document: { description: "按 kind 读取文档定义" },
    documentFields: { description: "按 kind 读取合并后的字段定义" },
    contextView: { description: "读取项目或章节上下文视图" },
    resolveDocument: { description: "按 kind 和参数解析文档路径" },
    kindForPath: { description: "按路径识别文档 kind" },
    materializeDocument: { description: "补齐并规范化普通故事数据" },
    encodeDocument: { description: "编码自描述故事 JSON" },
    decodeDocument: { description: "解码自描述故事 JSON" },
    projectManifestPath: { description: "返回项目 Manifest 路径" },
    createProject: { description: "创建空故事项目" },
    parseManifest: { description: "解析并校验 Manifest" },
    assembleProject: { description: "从文件条目装配故事项目" },
    projectFiles: { description: "枚举项目内容文件" },
    projectManifest: { description: "读取项目 Manifest 数据" },
    projectInfo: { description: "读取项目身份与 revision" },
    validateProject: { description: "按 profile 校验完整项目" },
    applyChanges: { description: "应用并校验原子 ChangeSet" },
    readContext: { description: "生成项目摘要或章节写作上下文" },
  },
});

class CompilerRegistry implements StoryProjectCompilerRegistry {
  readonly #compilers = new Map<string, StoryProjectCompiler>();

  constructor(compilers: readonly StoryProjectCompiler[] = []) {
    for (const compiler of compilers) this.register(compiler);
  }

  register(compiler: StoryProjectCompiler) {
    if (this.#compilers.has(compiler.format)) {
      throw new Error(`故事协议 Compiler 重复注册：${compiler.format}`);
    }
    this.#compilers.set(compiler.format, compiler);
    return this;
  }

  resolve(format: string) {
    const compiler = this.#compilers.get(format);
    if (!compiler) throw new Error(`没有受信任的 StoryProjectCompiler 可以处理：${format}`);
    return compiler;
  }

  compile(format: string, source: Parameters<StoryProjectCompiler["compile"]>[0]): StoryProjectApi {
    const project = this.resolve(format).compile(source);
    assertProtocolImplementation(STORY_PROJECT_API_DEFINITION, project);
    return project;
  }
}

export const createStoryProjectCompilerRegistry = (
  compilers: readonly StoryProjectCompiler[] = [],
): StoryProjectCompilerRegistry => new CompilerRegistry(compilers);
