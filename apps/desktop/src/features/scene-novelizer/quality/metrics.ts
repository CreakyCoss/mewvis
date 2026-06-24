import type {
  SceneNovelDraftQuality,
  SceneNovelSource,
} from "../types";
import { countSceneNovelContamination } from "./contamination";
import {
  getSceneNovelParagraphStats,
} from "./paragraph";

const hookEndingPattern =
  /(?:门外|窗外|脚步|追兵|倒计时|钥匙|血|火|雨|钟声|来不及|逼近|失踪|真相|代价|选择|下一步|不能再等|有人来了|灯灭|闩动|名单|令牌|铜牌|后门|东口|路线|老板娘|钥匙串)/;

const clampScore = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export const evaluateSceneNovelDraft = ({
  text,
  source,
}: {
  text: string;
  source: SceneNovelSource;
}): SceneNovelDraftQuality => {
  const paragraphStats = getSceneNovelParagraphStats(
    text,
    source.constraints.paragraphMaxChars,
  );
  const contaminationCount = countSceneNovelContamination(text);
  const hasHookEnding = hookEndingPattern.test(text.slice(-180));
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
