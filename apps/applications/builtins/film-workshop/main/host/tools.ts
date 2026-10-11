import { defineTool } from "@mewvis/app-sdk";
import { deliveryReport, validateProject } from "../model";

export default [
  defineTool({
    name: "film_check_delivery",
    description:
      "检查影视项目的当前分集制作计划，核验数据与素材引用，列出缺少的剧本、分镜、提示词及台词角色。不会生成媒体或修改项目。",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        project: { type: "object" },
        episodeId: { type: "string" },
      },
      required: ["project", "episodeId"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ready: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
          shots: { type: "integer" },
          duration: { type: "number" },
          mediaVerified: { type: "boolean", const: false },
          projectTitle: { type: "string" },
          episodeTitle: { type: "string" },
        },
        required: [
          "ready",
          "issues",
          "shots",
          "duration",
          "mediaVerified",
          "projectTitle",
          "episodeTitle",
        ],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown) => [
        { type: "text", text: JSON.stringify(value, null, 2) },
      ],
    },
    execute(args: unknown) {
      const input = args as { project?: unknown; episodeId?: unknown } | null;
      const project = validateProject(input?.project);
      const episode = project.episodes.find((e) => e.id === input?.episodeId);
      if (!episode) throw new Error("未找到当前分集");
      return deliveryReport(project, episode);
    },
  }),
];
