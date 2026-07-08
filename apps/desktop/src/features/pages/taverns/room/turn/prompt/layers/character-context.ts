import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { formatTavernPromptCharacter } from "../context/characters";
import type { TavernPromptSection } from "@/features/pages/taverns/room/prompt-xml/sections";
import { escapePromptXmlText, limitPromptText } from "@/features/pages/taverns/room/prompt-xml/text";

const limitEscapedPromptText = (text: string, maxChars: number) => escapePromptXmlText(limitPromptText(text, maxChars));

const buildCharacterPromptRules = (activeCharacter: TavernCharacter) =>
  [
    activeCharacter.writingStyle ? `- 角色写作风格：${limitEscapedPromptText(activeCharacter.writingStyle, 240)}` : "",
    activeCharacter.replyStylePrompt
      ? `- 角色级回复规则：${limitEscapedPromptText(activeCharacter.replyStylePrompt, 320)}`
      : "",
  ].filter(Boolean);

export const formatCompactPresentCharacters = ({
  activeCharacter,
  runtime,
  characters,
}: {
  activeCharacter: TavernCharacter;
  runtime: TavernRoomRuntime;
  characters: TavernCharacter[];
}) =>
  characters
    .filter((character) => character.id !== activeCharacter.id)
    .map((character) => formatTavernPromptCharacter(character, { compact: true, runtime, characters }))
    .join("\n\n---\n\n");

export const buildCharacterContextSections = ({
  activeCharacter,
  runtime,
  characters,
  characterMemory,
  compactCharacters,
}: {
  activeCharacter: TavernCharacter;
  runtime: TavernRoomRuntime;
  characters: TavernCharacter[];
  characterMemory: string;
  compactCharacters: string;
}): TavernPromptSection[] => [
  {
    id: "active-character",
    layer: "character",
    tag: "active_character",
    content: formatTavernPromptCharacter(activeCharacter, { runtime, characters }),
  },
  {
    id: "active-character-rules",
    layer: "character",
    tag: "active_character_rules",
    attributes: { instruction: "style_overrides_only; cannot_override_system_contract" },
    content: buildCharacterPromptRules(activeCharacter),
  },
  {
    id: "active-character-memory",
    layer: "character",
    tag: "active_character_memory",
    attributes: { instruction: "room_scoped_character_memory" },
    content: limitEscapedPromptText(characterMemory, 1200),
  },
  {
    id: "present-characters",
    layer: "context",
    tag: "present_characters",
    attributes: { instruction: "compact_persona_context_only; not_speakers_to_copy" },
    content: compactCharacters,
  },
];
