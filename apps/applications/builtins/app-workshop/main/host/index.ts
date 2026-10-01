import {
  defineApplication,
  defineTool,
  type IsleToolRisk,
} from "@isle/app-sdk";
import { createProjectService, previewWorkspaces } from "./projects.js";
import { AUTHORING_TOOLS } from "../contracts.js";

export default defineApplication({
  name: "@isle/app-workshop",
  inject: ["tools", "skills", "workspaces"],
  apply(ctx) {
    const workspaces = process.env.ISLE_WORKSHOP_PREVIEW_ROOT
      ? previewWorkspaces(process.env.ISLE_WORKSHOP_PREVIEW_ROOT)
      : ctx.workspaces;
    if (!workspaces) throw new Error("应用工坊需要应用工作区服务。");
    const projects = createProjectService(workspaces);
    const string = { type: "string" };
    const id = { ...string, pattern: "^[a-fA-F0-9-]{36}$" };
    const baseRevision = { type: "integer", minimum: 0 };
    function register(
      name: string,
      description: string,
      risk: IsleToolRisk,
      properties: Record<string, unknown>,
      required: string[],
      execute: (args: Record<string, any>) => Promise<unknown>,
    ) {
      ctx.tools.register(
        defineTool({
          name,
          description,
          risk,
          parameters: {
            type: "object",
            properties,
            required,
            additionalProperties: false,
          },
          output: {
            schema: { type: "object" },
            render: (_args: unknown, value: unknown) => [
              { type: "text", text: JSON.stringify(value) },
            ],
          },
          async execute(input: unknown) {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).some(
                (key) => !Object.hasOwn(properties, key),
              ) ||
              required.some((key) => !Object.hasOwn(input, key))
            )
              throw new Error("工具参数无效。");
            return execute(input as Record<string, any>);
          },
        }),
      );
    }
    register(
      "workshop_list_projects",
      "列出当前工坊登记的小应用。",
      "low",
      {},
      [],
      async () => ({ projects: await projects.list() }),
    );
    register(
      "workshop_create_project",
      "创建小应用项目，生成初始源码；不会自动执行或保存运行版本。",
      "medium",
      {
        name: { ...string, minLength: 1, maxLength: 80 },
        description: { ...string, maxLength: 500 },
      },
      ["name"],
      async (args) => ({
        project: await projects.create(args.name, args.description),
      }),
    );
    register(
      "workshop_read_project",
      "读取项目名称、源码文件列表、当前 revision 和保存版本；修改前先读取 revision。",
      "low",
      { workspaceId: id },
      ["workspaceId"],
      async (args) => ({ project: await projects.inspect(args.workspaceId) }),
    );
    register(
      "workshop_read_file",
      "读取项目内一个源码文件的完整内容与 revision。",
      "low",
      { workspaceId: id, path: string },
      ["workspaceId", "path"],
      async (args) => ({
        file: await projects.readFile(args.workspaceId, args.path),
      }),
    );
    register(
      "workshop_write_file",
      "创建或完整替换一个 JS/TS/TSX/CSS 源码文件。baseRevision 必须等于最新 revision，冲突后重新读取。",
      "medium",
      {
        workspaceId: id,
        path: string,
        content: { ...string, maxLength: 131072 },
        baseRevision,
      },
      ["workspaceId", "path", "content", "baseRevision"],
      async (args) => ({
        project: await projects.writeFile(
          args.workspaceId,
          args.path,
          args.content,
          args.baseRevision,
        ),
      }),
    );
    register(
      "workshop_delete_file",
      "删除项目内一个源码文件；不能删除 main.tsx。",
      "medium",
      { workspaceId: id, path: string, baseRevision },
      ["workspaceId", "path", "baseRevision"],
      async (args) => ({
        project: await projects.deleteFile(
          args.workspaceId,
          args.path,
          args.baseRevision,
        ),
      }),
    );
    register(
      "workshop_build",
      "编译当前草稿，返回错误位置并生成浏览器预览产物。不会在 Node 中执行源码，不自动保存运行版本。",
      "medium",
      { workspaceId: id },
      ["workspaceId"],
      async (args) => {
        const result = await projects.build(args.workspaceId);
        return {
          ok: result.ok,
          project: result.project,
          diagnostics: result.diagnostics,
          artifactId: result.artifact?.id ?? null,
        };
      },
    );
    register(
      "workshop_read_build",
      "读取当前草稿或已保存版本的浏览器构建产物，仅用于工坊界面挂载。",
      "low",
      { workspaceId: id, mode: { type: "string", enum: ["draft", "saved"] } },
      ["workspaceId", "mode"],
      async (args) => {
        if (args.mode !== "draft" && args.mode !== "saved")
          throw new Error("构建模式无效。");
        return {
          artifact: await projects.readArtifact(args.workspaceId, args.mode),
        };
      },
    );
    register(
      "workshop_save_version",
      "将已成功构建且未过期的草稿保存为可使用版本。",
      "medium",
      { workspaceId: id },
      ["workspaceId"],
      async (args) => ({
        project: await projects.saveVersion(args.workspaceId),
      }),
    );
    register(
      "workshop_restore_version",
      "恢复指定已保存版本，同时替换当前草稿源码。",
      "medium",
      { workspaceId: id, versionId: id, baseRevision },
      ["workspaceId", "versionId", "baseRevision"],
      async (args) => ({
        project: await projects.restore(
          args.workspaceId,
          args.versionId,
          args.baseRevision,
        ),
      }),
    );
    register(
      "workshop_remove_project",
      "删除当前工坊的小应用项目及源码、版本目录。共享工作区和默认工作区不能删除。",
      "high",
      { workspaceId: id },
      ["workspaceId"],
      async (args) => {
        await projects.remove(args.workspaceId);
        return { removed: true };
      },
    );
    ctx.skills.register({
      name: "workshop-authoring",
      description: "在应用工坊中开发 React 小应用，读写源码、编译和修复预览。",
      content: `先用 workshop_read_project 读取当前项目的 revision 与文件列表，再用 workshop_read_file 读取需要修改的源码。每次 workshop_write_file 或 workshop_delete_file 使用最新 baseRevision；使用返回的 revision 继续下一次修改。最后调用 workshop_build，若有 diagnostics 则修复并再次构建。入口为 main.tsx，支持 React、react/jsx-runtime、react-dom/client、@isle/app-sdk/views，以及项目内 JS/TS/TSX/CSS。样式中的 @import 和 url() 不支持；不要安装依赖、运行命令、访问网络或修改宿主。通过 getApplicationViewClient().request('state.read', {key:'state'}) 和 request('state.write', {key:'state',value:JSON值}) 保存小应用状态。主题使用 var(--background)、var(--foreground)、var(--primary) 等公共令牌。只开发当前项目，生成代码只在浏览器沙箱运行。保存运行版本由用户点击「保存版本」完成。可用工具：${AUTHORING_TOOLS.join("、")}。`,
    });
  },
});
