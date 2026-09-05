import type { ChatProfile } from "@/chat/desktop";
import type { Skill } from "@/features/pages/skills/types";
import type { StoryLibraryItem } from "../../../storage";
import { storyDocumentData } from "../../../story-document";

const STORY_SKILL_NAME = "story-assistant";
const storyToolNames = new Set(["read", "ls", "find", "grep", "ask_user"]);

const resolveRevision = (story: StoryLibraryItem) => {
  const manifest = story.documents.map(storyDocumentData).find((data) => data?.kind === "story-manifest");
  return typeof manifest?.revision === "number" ? manifest.revision : null;
};

const storySkill = (story: StoryLibraryItem): Skill & { label: string } => ({
  key: STORY_SKILL_NAME,
  name: STORY_SKILL_NAME,
  label: "故事创作助手",
  description: "使用结构化故事能力规划、分析和创作当前故事。",
  content: [
    "你正在 Mewvis 的结构化故事创作弹窗中协作。",
    "必须先使用 story-assistant 专属路由，再按意图选择对应的 story-assistant-* 技能。不要调用普通 story-* 技能。",
    "story-authoring 内置能力已经强制绑定私有 story 工具。首次工作先调用 story(action=describe_structure) 获取完整故事类型定义。写作时优先使用 read_context 返回的可读 text，所有结构化或 Markdown 变更通过 ChangeSet 校验后落库。",
    "若 story(action=read_context) 报项目尚未初始化，调用 story(action=initialize)；存储中已有故事记录时未经用户确认不得 replaceExisting。",
    "正式故事文件只能通过 story(action=commit_changes) 原子校验并提交：工具会先完整校验，只有通过后才写入。不要在每次提交前额外调用 action=validate_changes；该动作只用于用户明确要求预览或排查校验错误。",
    "不要使用 write、edit 或 bash 修改 story 目录。不要创建 Markdown 故事资产。",
    `当前故事 ID：${story.overview.id}`,
    `当前 revision：${resolveRevision(story) ?? "尚未初始化"}`,
  ].join("\n"),
  source: "system",
  path: "",
});

export const prepareStoryChatProfile = (story: StoryLibraryItem): ChatProfile => ({
  id: `story:${story.overview.id}`,
  systemPrompt: (path) =>
    ["你是 Mewvis 的工作区 AI 助手。", `工作区路径：${path}`, "你可以帮助用户规划、写作、分析和修改工作区文件。"].join(
      "\n",
    ),
  skills: [storySkill(story)],
  skillGroup: { label: "故事创作", description: "使用结构化故事能力规划、分析和创作当前故事。" },
  useKnowledge: false,
  allowedToolNames: [...storyToolNames],
});
