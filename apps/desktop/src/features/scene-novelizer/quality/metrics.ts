import type { SceneNovelDraftQuality, SceneNovelSource } from "../types";
import { getSceneNovelizerRuleOptions } from "../prompt-registry/rule-options";
import { countSceneNovelContamination } from "./contamination";
import { getSceneNovelParagraphStats } from "./paragraph";

const hookEndingPattern =
  /(?:门外|窗外|脚步|追兵|倒计时|钥匙|血|火|雨|钟声|来不及|逼近|失踪|真相|代价|选择|下一步|不能再等|有人来了|灯灭|闩动|名单|令牌|铜牌|后门|东口|路线|老板娘|钥匙串)/;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const countMatches = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

export const evaluateSceneNovelDraft = ({
  text,
  source,
}: {
  text: string;
  source: SceneNovelSource;
}): SceneNovelDraftQuality => {
  const ruleOptions = getSceneNovelizerRuleOptions(source.ruleOptionIds);
  const enabledRuleIds = new Set(ruleOptions.map((rule) => rule.id));
  const paragraphStats = getSceneNovelParagraphStats(text, source.constraints.paragraphMaxChars);
  const contaminationCount = countSceneNovelContamination(text);
  const hasHookEnding = hookEndingPattern.test(text.slice(-180));
  const aiTemplateCount = countMatches(
    text,
    /(?:命运齿轮|眼中闪过一丝|眼底闪过一丝|嘴角勾起一抹|心中涌起|内心深处|这一刻|仿佛整个世界|空气仿佛凝固|宛若|像是被什么击中)/g,
  );
  const mechanicalDialogueTagCount = countMatches(text, /(?:说道|问道|解释道|表示|开口道|沉声道|淡淡道)/g);
  const summaryToneCount = countMatches(
    text.slice(-360),
    /(?:这意味着|他终于明白|她终于明白|所有人都知道|毫无疑问|归根结底|从这一刻起|这一切都说明)/g,
  );
  const emptyAmbienceCount = countMatches(
    text,
    /(?:空气|沉默|灯光|风声|雨声|夜色|阴影|寂静|气氛)(?:里|中|下)?(?:仿佛|像是|显得|变得|格外|更加)?/g,
  );
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 100;

  if (paragraphStats.charCount < Math.max(500, source.constraints.targetChars * 0.65)) {
    score -= 16;
    issues.push("正文长度不足，场景素材没有充分小说化。");
  } else {
    strengths.push("正文长度达到章节片段基线。");
  }

  if (paragraphStats.paragraphCount < 6) {
    score -= 12;
    issues.push("段落数量偏少，阅读节奏容易像整块说明。");
  }

  if (paragraphStats.overlongParagraphCount > 0) {
    score -= Math.min(24, paragraphStats.overlongParagraphCount * 8);
    issues.push("存在超过段落上限的大段落，需要拆分动作、对白和线索。");
  } else if (paragraphStats.paragraphCount > 0) {
    strengths.push("段落长度符合网文短段阅读习惯。");
  }

  if (paragraphStats.maxParagraphChars > source.constraints.paragraphMaxChars + 60) {
    score -= 8;
  }

  if (contaminationCount > 0) {
    score -= Math.min(30, contaminationCount * 10);
    issues.push("存在协议标签或提示词残留。");
  } else {
    strengths.push("未发现协议标签或提示词污染。");
  }

  if (!hasHookEnding) {
    score -= 12;
    issues.push("结尾缺少明确悬念、危险、选择压力或下一步冲突。");
  } else {
    strengths.push("结尾具备继续阅读的压力点。");
  }

  if (source.stats.consequenceCount === 0) {
    score -= 8;
    issues.push("源素材中用户行动后果不足，成稿容易退成问答记录。");
  }

  if (source.stats.hookCount === 0) {
    score -= 8;
    issues.push("源素材中主线钩子不足，建议先加强导演事件打断。");
  }

  if (enabledRuleIds.has("anti-ai-natural")) {
    if (aiTemplateCount > 0) {
      score -= Math.min(12, aiTemplateCount * 4);
      issues.push("命中模板化 AI 句式，建议改成具体动作、物件变化或现场反应。");
    } else {
      strengths.push("未命中常见模板化 AI 句式。");
    }
  }

  if (enabledRuleIds.has("natural-dialogue")) {
    if (source.stats.dialogueCount > 0 && mechanicalDialogueTagCount > 10) {
      score -= 6;
      issues.push("对白标记过密，容易像资料转述；建议用动作和潜台词拆开。");
    } else if (source.stats.dialogueCount > 0) {
      strengths.push("对白标记密度处于可控范围。");
    }
  }

  if (enabledRuleIds.has("concise-no-summary")) {
    if (summaryToneCount > 0) {
      score -= Math.min(10, summaryToneCount * 5);
      issues.push("结尾或段末有总结腔，建议落到动作、危险或下一句对白。");
    } else {
      strengths.push("未发现明显段末总结腔。");
    }
  }

  if (enabledRuleIds.has("reduce-empty-ambience")) {
    const ambienceLimit = Math.max(8, paragraphStats.paragraphCount);
    if (emptyAmbienceCount > ambienceLimit) {
      score -= Math.min(10, Math.ceil((emptyAmbienceCount - ambienceLimit) / 2) * 2);
      issues.push("空泛环境词偏多，建议让环境细节承担线索、动作或压力。");
    } else {
      strengths.push("环境描写没有明显空转。");
    }
  }

  if (enabledRuleIds.has("slow-buildup") && paragraphStats.paragraphCount >= 3) {
    const opening = text.split(/\n+/u).slice(0, 3).join("\n");
    if (!/(?:冲|撞|推|抓|响|叫|问|盯|血|火|门|脚步|倒计时|来不及|钥匙|证据|选择|危险)/u.test(opening)) {
      score -= 6;
      issues.push("开头三段事件压力偏弱，容易慢热空转。");
    }
  }

  if (enabledRuleIds.has("long-lore-overexplain")) {
    const loreExplainCount = countMatches(text, /(?:规则|设定|原来|其实|因为|所以|资料|档案|背景|世界|体系|流程)/g);
    if (paragraphStats.maxParagraphChars > source.constraints.paragraphMaxChars + 40 || loreExplainCount > 18) {
      score -= 8;
      issues.push("设定或案情解释偏重，建议拆进动作、证据变化和角色反应。");
    }
  }

  if ((enabledRuleIds.has("promise-mismatch") || enabledRuleIds.has("expectation-hook")) && !hasHookEnding) {
    score -= 6;
    issues.push("已启用承诺/期待规则，但结尾没有接住当前场景期待。");
  }

  if (enabledRuleIds.has("reward-feedback") && source.stats.consequenceCount === 0) {
    score -= 6;
    issues.push("已启用反馈爽点，但源素材缺少行动后果，建议先让导演补充后果事件。");
  }

  if (ruleOptions.length > 0) {
    strengths.push(`已按 ${ruleOptions.length} 个实时写作规则检查。`);
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    verdict: finalScore >= 82 ? "pass" : finalScore >= 68 ? "warn" : "fail",
    charCount: paragraphStats.charCount,
    paragraphCount: paragraphStats.paragraphCount,
    averageParagraphChars: paragraphStats.averageParagraphChars,
    maxParagraphChars: paragraphStats.maxParagraphChars,
    overlongParagraphCount: paragraphStats.overlongParagraphCount,
    contaminationCount,
    hasHookEnding,
    issues,
    strengths,
  };
};
