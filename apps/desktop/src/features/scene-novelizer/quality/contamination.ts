const protocolLeakPattern =
  /<\/?\s*(?:inner_thought|private_thought|history_private_thought|reply|public_reply|history_public_reply|public_content|narrative_beat|history_narrative_beat|narrativebeat|publicreply|innerthought)(?:\s+[^>]*)?\s*>/gi;

const promptLeakPattern =
  /(?:输出格式|严格遵守|request_context|runtimeInstruction|XML|JSON|不要在标签外|系统提示词|prompt_block)/gi;

export const countSceneNovelContamination = (text: string) => {
  const protocolMatches = text.match(protocolLeakPattern) ?? [];
  const promptMatches = text.match(promptLeakPattern) ?? [];

  return protocolMatches.length + promptMatches.length;
};

export const cleanSceneNovelDraftText = (text: string) =>
  text
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(protocolLeakPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
