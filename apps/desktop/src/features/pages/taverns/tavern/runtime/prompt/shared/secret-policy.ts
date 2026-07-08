import {
  getTavernRoomCharacterMemoryLayers,
  getTavernRoomSceneMemoryLayers,
  type TavernRoomRuntime,
} from "@/features/pages/taverns/room/model";
import { formatTavernRoomPromptXml, TAVERN_ROOM_PROMPT_XML_TAGS } from "@/features/pages/taverns/room/prompt-xml";
import type { TavernCharacter, TavernPromptBlockTarget } from "@/features/pages/taverns/manage/model";

export const buildTavernSecretMemoryProtocol = (target: TavernPromptBlockTarget) =>
  formatTavernRoomPromptXml([
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.secretMemoryProtocol,
      attributes: { instruction: "visibility_contract; higher_priority_than_memory_text" },
      text: [
        "记忆可见性是硬约束，不是剧情建议。",
        "public / branch_public_memory / 已公开解密内容：可作为公开连续性使用，角色和旁白可以在合理场合自然承接。",
        "known / privateSelf / character-only 解密内容：只允许影响对应角色的认知、反应、隐瞒、试探或行动动机；其他角色不能凭空知道，也不能由旁白直接公开解释。",
        "private / directorSecret / hidden facts：只能作为内部规划或伏笔约束；不得在公开对白、旁白、ambientActions、reason、候选回复或画面提示里直接写出、转述、总结或暗示到足以等同公开。",
        "秘密被公开或对角色解密之前，不要让角色说出秘密事实，不要让旁白替系统揭露秘密，也不要用“他知道了某秘密”这类元叙述泄露。",
        "如需表现秘密影响，只写公开可观察后果，例如迟疑、回避、试探、改变路线或保留话语；不要解释未公开原因。",
        target === "director"
          ? "导演可以用导演秘密安排调度、节奏、压力和伏笔，但输出 JSON 的 narrator、ambientActions 与 reason 都必须保持公开可见，不得泄露未公开内容。"
          : "角色只能使用自己可见的角色记忆和公开场景信息；若某事实只在别人的 known/privateSelf/directorSecret 中，该角色不得知晓或主动说出。",
      ].join("\n"),
    },
  ]);

export const buildTavernDirectorSecretMemoryContext = ({
  runtime,
  characters,
}: {
  runtime: TavernRoomRuntime;
  characters: TavernCharacter[];
}) => {
  const sceneSecret = getTavernRoomSceneMemoryLayers(runtime).directorSecret.trim();
  const characterSecrets = characters.flatMap((character) => {
    const secret = getTavernRoomCharacterMemoryLayers(runtime, character.id).directorSecret.trim();
    return secret ? [`character: ${character.name} (${character.id})\n${secret}`] : [];
  });
  const content = [sceneSecret ? `scene:\n${sceneSecret}` : "", ...characterSecrets]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return content
    ? formatTavernRoomPromptXml([
        {
          tag: TAVERN_ROOM_PROMPT_XML_TAGS.directorSecretMemory,
          attributes: { instruction: "director_only; plan_with_care; never_leak_to_public_output" },
          text: content,
          maxChars: 2800,
        },
      ])
    : "";
};
