import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-preset-20-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");
const systemPresetRoomPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/system-preset-room.ts");

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

writeFileSync(entryPath, `
  import {
    advanceTavernProgressFromFactEvents,
    getTavernStatusSnapshotValue,
    resolveTavernScheduledSpeakers,
  } from ${JSON.stringify(corePath)};
  import { createTavernRoomFromSystemPreset } from ${JSON.stringify(systemPresetRoomPath)};

  const baseNow = 1_800_000_000_000;

  const materializePreset = (presetId, characterIds, roomId) =>
    createTavernRoomFromSystemPreset("workspace-e2e", presetId, {
      roomId,
      createdAt: baseNow,
      characterIdByPresetId: new Map(Object.entries(characterIds)),
      markAsSystemPreset: false,
    });

  const applyProgressPatch = (room, patch) => ({
    ...room,
    factEvents: patch.factEvents,
    statusEvents: patch.statusEvents,
    previousStatusSnapshot: patch.previousStatusSnapshot,
    statusSnapshot: patch.statusSnapshot,
    taskEvents: patch.taskEvents,
    taskSnapshot: patch.taskSnapshot,
    outcomeEvents: patch.outcomeEvents,
    replyOptions: patch.replyOptions,
    sceneDirection: patch.sceneDirection,
    sceneTransition: patch.sceneTransition,
    updatedAt: patch.statusSnapshot.updatedAt,
  });

  const createMessage = ({
    id,
    room,
    role,
    content,
    characterId,
    turnId,
    createdAt,
    thought,
  }) => ({
    id,
    roomId: room.id,
    sceneId: room.activeSceneId,
    turnId,
    role,
    ...(characterId ? { characterId } : {}),
    content,
    ...(thought ? { thought } : {}),
    createdAt,
    status: "done",
  });

  const novelPresetCases = [
    {
      key: "raincity",
      presetId: "raincity-silent-manuscript",
      roomId: "room-raincity-20",
      characterIds: {
        "rc-ji-ling": "rain-ji",
        "rc-yuan-ci": "rain-yuan",
        "rc-su-yan": "rain-su",
        "rc-he-mu": "rain-he",
      },
      targetCharacterId: "rain-yuan",
      eventRounds: [
        { round: 5, type: "fragment_found", target: { type: "scene" } },
        { round: 10, type: "author_sheltered", target: { type: "global" } },
        { round: 15, type: "voice_fragment", target: { type: "character", characterId: "rain-yuan" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "manuscript_integrity", expected: 60 },
        { scope: { type: "global" }, statusId: "author_safety", expected: 70 },
        { scope: { type: "character", characterId: "rain-yuan" }, statusId: "voice_recovery", expected: 50 },
      ],
      completedTaskId: "rc-recover-first-chapter",
      outcomeId: "rc-manuscript-remembers",
    },
    {
      key: "snowridge",
      presetId: "snowridge-sword-oath",
      roomId: "room-snowridge-20",
      characterIds: {
        "sx-lin-zhaoye": "snow-lin",
        "sx-gu-tingxue": "snow-gu",
        "sx-qiu-heng": "snow-qiu",
        "sx-jingchen": "snow-jing",
      },
      targetCharacterId: "snow-gu",
      eventRounds: [
        { round: 5, type: "oath_verified", target: { type: "scene" } },
        { round: 10, type: "ambush_deflected", target: { type: "global" } },
        { round: 15, type: "wound_treated", target: { type: "character", characterId: "snow-lin" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "oath_clarity", expected: 55 },
        { scope: { type: "global" }, statusId: "sect_pressure", expected: 45 },
        { scope: { type: "character", characterId: "snow-lin" }, statusId: "wound_risk", expected: 35 },
      ],
      completedTaskId: "sx-read-oath-stone",
      outcomeId: "sx-oath-restored",
    },
    {
      key: "orbital",
      presetId: "orbital-ashes-letter",
      roomId: "room-orbital-20",
      characterIds: {
        "oa-lan-qiao": "orbit-lan",
        "oa-mira": "orbit-mira",
        "oa-ren-ke": "orbit-ren",
        "oa-yi-sen": "orbit-yi",
      },
      targetCharacterId: "orbit-mira",
      eventRounds: [
        { round: 5, type: "signal_decoded", target: { type: "scene" } },
        { round: 10, type: "orbit_stabilized", target: { type: "global" } },
        { round: 15, type: "oxygen_restored", target: { type: "character", characterId: "orbit-ren" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "signal_integrity", expected: 65 },
        { scope: { type: "global" }, statusId: "station_decay", expected: 47 },
        { scope: { type: "character", characterId: "orbit-ren" }, statusId: "oxygen_margin", expected: 80 },
      ],
      completedTaskId: "oa-decode-ember-letter",
      outcomeId: "oa-letter-opened",
    },
  ];

  const normalizeEventTarget = (target, room) =>
    target.type === "scene"
      ? { type: "scene", sceneId: room.activeSceneId }
      : target;

  const runNovelPresetTwentyRounds = (presetCase) => {
    const materialized = materializePreset(
      presetCase.presetId,
      presetCase.characterIds,
      presetCase.roomId,
    );
    let room = materialized.room;
    const characters = materialized.characters;
    const messages = [...materialized.messages];
    const orders = [];
    const eventByRound = new Map(presetCase.eventRounds.map((event) => [event.round, event]));

    for (let round = 1; round <= 20; round += 1) {
      const turnId = \`\${presetCase.key}-turn-\${round}\`;
      const createdAt = baseNow + round * 1_000;
      messages.push(createMessage({
        id: \`\${presetCase.key}-user-\${round}\`,
        room,
        role: "user",
        content: \`第 \${round} 轮，我推进当前小说节点，但不替角色做决定。\`,
        turnId,
        createdAt,
      }));

      const speakers = resolveTavernScheduledSpeakers({
        room,
        availableCharacters: characters,
        activeCharacterId: room.activeCharacterId,
        directorSpeakerIds: [characters[round % characters.length]?.id ?? characters[0].id],
        selectedTargetCharacterIds: [presetCase.targetCharacterId],
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

      const event = eventByRound.get(round);
      if (event) {
        room = applyProgressPatch(
          room,
          advanceTavernProgressFromFactEvents({
            room,
            factEvents: [{
              id: \`\${presetCase.key}-fact-\${event.type}\`,
              turnId,
              sourceMessageIds: [\`\${presetCase.key}-user-\${round}\`],
              type: event.type,
              target: normalizeEventTarget(event.target, room),
              evidence: \`第 \${round} 轮出现了与 \${event.type} 对应的明确证据。\`,
              confidence: 0.95,
              visibility: "public",
              createdAt: createdAt + 200,
            }],
            turnId,
            createdAt: createdAt + 300,
          }),
        );
      }
    }

    return {
      presetId: presetCase.presetId,
      room,
      characters,
      messages,
      orders,
      mappedCharacterIds: characters.map((character) => character.id),
      statusValues: Object.fromEntries(presetCase.statusChecks.map((check) => [
        check.statusId,
        getTavernStatusSnapshotValue(room.statusSnapshot, check.scope, check.statusId),
      ])),
      expectedStatusValues: Object.fromEntries(presetCase.statusChecks.map((check) => [
        check.statusId,
        check.expected,
      ])),
      completedTaskId: presetCase.completedTaskId,
      completedTaskStatus: room.taskSnapshot[presetCase.completedTaskId]?.status,
      outcomeId: presetCase.outcomeId,
      hasOutcome: room.outcomeEvents.some((event) => event.outcomeId === presetCase.outcomeId),
    };
  };

  globalThis.__tavernPresetTwentyRoundChecks = {
    presets: novelPresetCases.map(runNovelPresetTwentyRounds),
  };
`, "utf8");

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
  assert(Array.isArray(presets) && presets.length === 3, "Novel preset 20-round checks should cover all current presets", {
    presetCount: presets?.length,
  });

  for (const preset of presets) {
    assert(preset.room.replyMode === "director", "Novel preset should use director reply mode", {
      presetId: preset.presetId,
      replyMode: preset.room.replyMode,
    });
    assert(preset.orders.length === 20, "Novel preset should run exactly 20 rounds", {
      presetId: preset.presetId,
      rounds: preset.orders.length,
    });
    assert(
      preset.orders.every((order) => order.length > 0),
      "Novel preset scheduling should keep at least one speaker each round",
      { presetId: preset.presetId, orders: preset.orders },
    );
    assert(
      preset.mappedCharacterIds.every((characterId) =>
        preset.orders.some((order) => order.includes(characterId))
      ),
      "Novel preset mapped characters should all appear in 20-round scheduling",
      { presetId: preset.presetId, mappedCharacterIds: preset.mappedCharacterIds, orders: preset.orders },
    );
    assert(
      Object.entries(preset.expectedStatusValues).every(([statusId, expected]) =>
        preset.statusValues[statusId] === expected
      ),
      "Novel preset progress events should update configured statuses",
      {
        presetId: preset.presetId,
        statusValues: preset.statusValues,
        expectedStatusValues: preset.expectedStatusValues,
      },
    );
    assert(
      preset.completedTaskStatus === "completed",
      "Novel preset primary task should complete during 20-round progression",
      {
        presetId: preset.presetId,
        taskId: preset.completedTaskId,
        taskStatus: preset.completedTaskStatus,
      },
    );
    assert(
      preset.hasOutcome,
      "Novel preset primary outcome should be emitted during 20-round progression",
      {
        presetId: preset.presetId,
        outcomeId: preset.outcomeId,
        outcomeEvents: preset.room.outcomeEvents,
      },
    );
  }

  const summary = {
    ok: true,
    presets: presets.map((preset) => ({
      presetId: preset.presetId,
      rounds: preset.orders.length,
      mappedCharacterIds: preset.mappedCharacterIds,
      statusValues: preset.statusValues,
      completedTask: preset.completedTaskStatus,
      outcomes: preset.room.outcomeEvents.map((event) => event.outcomeId),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
