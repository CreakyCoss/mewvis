import type {
  StoryImportDraftCharacter,
  StoryImportDraftLorebookEntry,
  StoryImportDraftScene,
} from "./import-draft";
import {
  firstNonEmpty,
  isRecord,
  joinSections,
  recordArrayValue,
  stringArrayValue,
  trimText,
} from "./import-bridge-utils";

export const normalizeWorldBookEntries = (entries: unknown): StoryImportDraftLorebookEntry[] => {
  const sourceEntries = Array.isArray(entries)
    ? entries
    : isRecord(entries)
    ? Object.values(entries)
    : [];

  return sourceEntries.flatMap((entry, index): StoryImportDraftLorebookEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const content = firstNonEmpty(entry.content, entry.text, entry.description);
    if (!content) {
      return [];
    }

    const keywords = [
      ...stringArrayValue(entry.keywords),
      ...stringArrayValue(entry.key),
      ...stringArrayValue(entry.keysecondary),
    ];
    const title = firstNonEmpty(
      entry.title,
      entry.name,
      entry.comment,
      keywords[0],
      typeof entry.uid === "number" || typeof entry.uid === "string"
        ? `世界书 ${entry.uid}`
        : `世界书 ${index + 1}`,
    );

    return [{
      id: firstNonEmpty(entry.id, `lore-${index + 1}`),
      title,
      content,
      keywords: [...new Set(keywords)],
      enabled: entry.enabled !== false && entry.disable !== true,
      alwaysOn: entry.alwaysOn === true || entry.constant === true,
    }];
  });
};

export const normalizeCharacters = (characters: unknown): StoryImportDraftCharacter[] =>
  recordArrayValue(characters).flatMap((character, index): StoryImportDraftCharacter[] => {
    const name = firstNonEmpty(character.name, character.label, character.title);
    const description = joinSections([
      ["角色设定", firstNonEmpty(character.description, character.persona, character.profile)],
      ["性格", character.personality],
      ["背景", character.background],
      ["目标", character.goals],
    ]);
    const speakingStyle = firstNonEmpty(
      character.speakingStyle,
      character.replyStyle,
      character.dialogueStyle,
      character.mes_example,
      character.dialogue_examples,
    );
    if (!name && !description && !speakingStyle) {
      return [];
    }

    return [{
      id: firstNonEmpty(character.id, character.key, `char-${index + 1}`),
      name: name || `角色 ${index + 1}`,
      avatar: trimText(character.avatar),
      description,
      speakingStyle: speakingStyle || "自然回应，保持人设一致。",
      writingStyle: firstNonEmpty(character.writingStyle, character.narrationStyle) || undefined,
      replyStylePrompt: firstNonEmpty(
        character.replyStylePrompt,
        character.systemPrompt,
        character.system_prompt,
        character.post_history_instructions,
      ) || undefined,
      goals: firstNonEmpty(character.goals, character.objective) || undefined,
      memory: firstNonEmpty(character.memory, character.privateMemory) || undefined,
      relationships: Array.isArray(character.relationships) ? character.relationships : undefined,
      extra: isRecord(character.extra) ? character.extra : undefined,
    }];
  });

export const normalizeScenes = (scenes: unknown): StoryImportDraftScene[] =>
  recordArrayValue(scenes).flatMap((scene, index): StoryImportDraftScene[] => {
    const sceneText = firstNonEmpty(scene.scene, scene.scenario, scene.description, scene.content);
    const goal = firstNonEmpty(scene.goal, scene.sceneGoal, scene.objective);
    const plot = firstNonEmpty(scene.plot, scene.storyPlot, scene.progress);
    if (!sceneText && !goal && !plot) {
      return [];
    }

    return [{
      id: firstNonEmpty(scene.id, scene.key, `scene-${index + 1}`),
      title: firstNonEmpty(scene.title, scene.name, `场景 ${index + 1}`),
      scene: sceneText,
      goal,
      plot,
      direction: firstNonEmpty(scene.direction, scene.storyDirection),
      transition: firstNonEmpty(scene.transition, scene.sceneTransition),
      memory: firstNonEmpty(scene.memory, scene.summary),
      characterIds: stringArrayValue(scene.characterIds),
      activeCharacterId: firstNonEmpty(scene.activeCharacterId) || undefined,
      lorebookEntries: normalizeWorldBookEntries(scene.lorebookEntries),
      extra: isRecord(scene.extra) ? scene.extra : undefined,
    }];
  });
