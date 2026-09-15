import { defineSkill } from "@isle/app-sdk";

export default [
  defineSkill({
    name: "isle-story-workbench",
    description: "在 Isle 故事工作区中读取设定、人物、大纲和章节，并辅助小说创作。",
    content: [
      "本技能只处理当前内置故事应用的故事工作区。",
      "使用 isle_story_inspect 查看项目类型、概览、文档目录和结构；需要文档正文时调用 isle_story_get_document，需要创作依据时调用 isle_story_read_context。",
      "workspaceId 必须来自用户当前选中的应用工作区，不能猜测、改写或访问其他工作区。",
      "编辑设定或章节时先解释修改意图，再调用 isle_story_save_document；保留原文未要求改动的部分。",
      "跨多份文档的变更先根据项目结构中的 changes 协议构造带 revision 的 changeSet，调用 isle_story_validate_changes，确认无错误后再调用 isle_story_commit_changes。",
      "删除文档需要用户明确要求。遇到兼容性问题先说明状态，升级只在用户要求时执行。",
      "不编造项目文档内容；工具失败时直接说明原因。",
    ].join("\n"),
  }),
];
