import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-preset-20-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const corePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/core/index.ts");
const systemPresetRoomPath = resolve(
  workspaceRoot,
  "src/features/pages/taverns/tavern/factories/system-preset-room.ts",
);
const runtimeRoomPath = resolve(workspaceRoot, "src/features/pages/taverns/room/model/runtime-room.ts");

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

writeFileSync(
  entryPath,
  `
  import { resolveTavernScheduledSpeakers } from ${JSON.stringify(corePath)};
  import { createTavernRoomFromSystemPreset } from ${JSON.stringify(systemPresetRoomPath)};
  import { createTavernActiveRoomViewFromConfig } from ${JSON.stringify(runtimeRoomPath)};

  const baseNow = 1_800_000_000_000;

  const createCharacter = (id, name, description) => ({
    id,
    name,
    avatar: "",
    description,
    speakingStyle: "短句，保持场景信息增量。",
    writingStyle: "克制、具体。",
    replyStylePrompt: "只回应当前节点内能感知的信息。",
    goals: "推进当前场景目标，但不替用户做决定。",
    relationships: [],
    createdAt: baseNow,
    updatedAt: baseNow,
  });

  const presetCases = [
    {
      key: "raincity",
      presetId: "raincity-mystery-stage",
      roomId: "room-raincity-20",
      characters: [
        createCharacter("rain-investigator", "穆青砚", "负责检查封蜡、雨痕和纸张纤维。"),
        createCharacter("rain-bartender", "梁桐", "熟悉雨城酒馆与过路人。"),
        createCharacter("rain-runner", "阿绮", "在门口和巷子之间传递消息。"),
      ],
    },
    {
      key: "snowridge",
      presetId: "snowridge-wuxia-stage",
      roomId: "room-snowridge-20",
      characters: [
        createCharacter("snow-swordsman", "谢孤鸿", "守在门边，判断江湖压力。"),
        createCharacter("snow-healer", "闻素", "观察伤势、毒性和人心变化。"),
        createCharacter("snow-scout", "柳七", "负责听雪线外的脚步。"),
      ],
    },
    {
      key: "orbital",
      presetId: "orbital-scifi-stage",
      roomId: "room-orbital-20",
      characters: [
        createCharacter("orbit-captain", "洛弥", "负责权衡舱段风险。"),
        createCharacter("orbit-engineer", "秦工", "关注系统告警和接口异常。"),
        createCharacter("orbit-medic", "伊芙", "追踪队员状态和生命体征。"),
      ],
    },
  ];

  const createMessage = ({
    id,
    room,
    role,
    content,
    characterId,
    turnId,
    createdAt,
  }) => ({
    id,
    roomId: room.id,
    sceneId: room.activeSceneId,
    sceneInstanceId: room.activeSceneInstanceId,
    turnId,
    role,
    ...(characterId ? { characterId } : {}),
    content,
    createdAt,
    status: "done",
  });

  const runPresetTwentyRounds = (presetCase) => {
    const materialized = createTavernRoomFromSystemPreset("workspace-e2e", presetCase.presetId, {
      roomId: presetCase.roomId,
      createdAt: baseNow,
      markAsSystemPreset: false,
    });
    const runtimeRoom = createTavernActiveRoomViewFromConfig(materialized.room);
    const characters = presetCase.characters;
    const room = {
      ...runtimeRoom,
      localCharacters: characters,
      characterIds: characters.map((character) => character.id),
      activeCharacterId: characters[0].id,
      userPersonaName: "旅人",
      settings: {
        ...runtimeRoom.settings,
        directorScheduling: {
          ...runtimeRoom.settings.directorScheduling,
          allowDirectorOnly: false,
        },
      },
    };
    const messages = [...materialized.messages];
    const orders = [];

    for (let round = 1; round <= 20; round += 1) {
      const turnId = \`\${presetCase.key}-turn-\${round}\`;
      const createdAt = baseNow + round * 1_000;
      const userMessage = createMessage({
        id: \`\${presetCase.key}-user-\${round}\`,
        room,
        role: "user",
        content: \`第 \${round} 轮，我推进当前小说节点，但不替角色做决定。\`,
        turnId,
        createdAt,
      });
      messages.push(userMessage);

      const primary = characters[round % characters.length];
      const secondary = characters[(round + 1) % characters.length];
      const speakers = resolveTavernScheduledSpeakers({
        settings: room.settings,
        availableCharacters: characters,
        activeCharacterId: room.activeCharacterId,
        directorSpeakerIds: [primary.id, secondary.id],
        directorNonverbalReplyIds: [],
        selectedTargetCharacterIds: round % 4 === 0 ? [secondary.id] : [],
        currentUserText: userMessage.content,
        fallbackCharacter: characters[0],
      });
      orders.push(speakers.map((speaker) => speaker.id));

      for (const [speakerIndex, speaker] of speakers.entries()) {
        messages.push(createMessage({
          id: \`\${presetCase.key}-\${round}-speaker-\${speaker.id}\`,
          room,
          role: "character",
          characterId: speaker.id,
          content: \`\${speaker.name}第 \${round} 轮只按当前节点信息回应。\`,
          turnId,
          createdAt: createdAt + speakerIndex + 1,
        }));
      }
    }

    return {
      presetId: presetCase.presetId,
      room,
      messages,
      orders,
      characterIds: characters.map((character) => character.id),
      directorLoop: room.settings.directorLoop,
    };
  };

  globalThis.__tavernPresetTwentyRoundChecks = {
    presets: presetCases.map(runPresetTwentyRounds),
  };
`,
  "utf8",
);

try {
  await build({
    entryPoints: [entryPath],
    outfile: bundledPath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@engines/native/agent": resolve(workspaceRoot, "agent-runtime/src/engines/drivers/native/agent"),
    },
    loader: {
      ".css": "empty",
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".svg": "file",
      ".webp": "file",
    },
    logLevel: "silent",
  });

  await import(pathToFileURL(bundledPath).href);
  const checks = globalThis.__tavernPresetTwentyRoundChecks;
  assert(checks, "20-round preset checks did not run");

  const { presets } = checks;
  assert(Array.isArray(presets) && presets.length === 3, "20-round checks should cover all default tavern presets", {
    presetCount: presets?.length,
  });

  for (const preset of presets) {
    assert(preset.room.replyMode === "director", "Preset should use director reply mode", {
      presetId: preset.presetId,
      replyMode: preset.room.replyMode,
    });
    assert(
      preset.directorLoop.enabled && preset.directorLoop.maxRounds >= 1,
      "Preset should keep per-turn director loop settings",
      { presetId: preset.presetId, directorLoop: preset.directorLoop },
    );
    assert(preset.orders.length === 20, "Preset should run exactly 20 scheduling rounds", {
      presetId: preset.presetId,
      rounds: preset.orders.length,
    });
    assert(
      preset.orders.every((order) => order.length > 0 && order.length <= preset.room.settings.directorMaxSpeakers),
      "Scheduling should keep at least one speaker and respect max speakers",
      { presetId: preset.presetId, orders: preset.orders, maxSpeakers: preset.room.settings.directorMaxSpeakers },
    );
    assert(
      preset.characterIds.every((characterId) => preset.orders.some((order) => order.includes(characterId))),
      "All configured characters should appear during 20-round scheduling",
      { presetId: preset.presetId, characterIds: preset.characterIds, orders: preset.orders },
    );
    assert(
      preset.messages.filter((message) => message.role === "user").length === 20,
      "20-round smoke should preserve user turns",
      { presetId: preset.presetId },
    );
    assert(
      preset.messages.filter((message) => message.role === "character").length >= 20,
      "20-round smoke should create character replies",
      { presetId: preset.presetId },
    );
  }

  const summary = {
    ok: true,
    presets: presets.map((preset) => ({
      presetId: preset.presetId,
      rounds: preset.orders.length,
      characterIds: preset.characterIds,
      directorLoop: preset.directorLoop,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
