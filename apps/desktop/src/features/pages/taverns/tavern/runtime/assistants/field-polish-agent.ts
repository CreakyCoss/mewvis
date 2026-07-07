import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernPromptStyleId } from "@/features/pages/taverns/manage/model";
import { TAVERN_PROMPT_STYLE_PRESETS, normalizeTavernPromptStyleId } from "../../presentation/prompt-styles";
import { runTavernOneShotAgent } from "../agent/one-shot";

export type TavernTextFieldAgentMode = "polish" | "inspire";

export type TavernTextFieldAgentInput = {
  workspacePath: string;
  runtimeModel?: RuntimeModelInput | null;
  mode: TavernTextFieldAgentMode;
  fieldLabel: string;
  currentText: string;
  promptStyleId?: TavernPromptStyleId | null;
  context: Record<string, unknown>;
};

export type TavernTextFieldAgentRequest = Omit<TavernTextFieldAgentInput, "workspacePath" | "runtimeModel">;

const TEXT_FIELD_AGENT_ROLE_ID = "tavern-one-shot-field-writer";

const buildTavernTextFieldAgentSystemPrompt = () =>
  [
    "你是酒馆配置文本润色 agent，只处理当前字段。",
    "必须只输出可直接填回输入框的正文，不要输出 JSON、标题、解释、markdown 代码块或额外问候。",
    "polish 模式：保留用户原意和关键设定，提升清晰度、稳定性和可演绎性。",
    "inspire 模式：在不覆盖已填内容的前提下补全灵感，补充要稳定、可观察、可被多 agent 使用。",
    "如果 request_context.context.constraints 存在，必须优先遵守这些字段约束。",
    "角色人设、背景故事、世界书互相引用时，只能基于 request_context 中已有内容扩写。",
    "不要替用户决定行动，不要让角色知道其他角色私密心理，不要增加会导致人设漂移的隐藏设定。",
    "随机事件、状态栏和任务相关文字必须保持公开可观察、可由明确事件推进。",
  ].join("\n");

const buildTavernTextFieldRequestContext = (input: TavernTextFieldAgentInput) => {
  const promptStyleId = normalizeTavernPromptStyleId(input.promptStyleId);
  return JSON.stringify(
    {
      mode: input.mode,
      fieldLabel: input.fieldLabel,
      currentText: input.currentText,
      promptStyleId,
      promptStyle: TAVERN_PROMPT_STYLE_PRESETS.find((preset) => preset.id === promptStyleId),
      context: input.context,
    },
    null,
    2,
  );
};

export const runTavernTextFieldAgent = async (input: TavernTextFieldAgentInput) => {
  const result = await runTavernOneShotAgent({
    workspacePath: input.workspacePath,
    agentRoleId: TEXT_FIELD_AGENT_ROLE_ID,
    runtimeModel: input.runtimeModel,
    systemPrompt: buildTavernTextFieldAgentSystemPrompt(),
    requestContext: buildTavernTextFieldRequestContext(input),
    runtimeInstruction:
      input.mode === "polish"
        ? "润色当前字段，只输出润色后的字段正文。"
        : "为当前字段补全灵感，只输出补全后的字段正文。",
    userMessage: `处理字段：${input.fieldLabel}`,
    allowedTools: [],
    enabledSkills: [],
  });

  return result.text
    .trim()
    .replace(/^```(?:text|markdown)?/i, "")
    .replace(/```$/i, "")
    .trim();
};
