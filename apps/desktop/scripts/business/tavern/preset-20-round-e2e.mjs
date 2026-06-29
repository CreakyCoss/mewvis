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

  const shellPresetCases = [
    {
      key: "raincity",
      presetId: "raincity-mystery-stage",
      roomId: "room-raincity-20",
      characterIds: {
        "rc-stage-director": "rain-director",
        "rc-stage-narrator": "rain-narrator",
      },
      targetCharacterId: "rain-narrator",
      eventRounds: [
        { round: 1, type: "story_input_received", target: { type: "scene" } },
        { round: 5, type: "evidence_confirmed", target: { type: "scene" } },
        { round: 10, type: "premature_reveal", target: { type: "scene" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "evidence_focus", expected: 65 },
        { scope: { type: "scene" }, statusId: "reveal_pressure", expected: 40 },
      ],
      completedTaskId: "mystery-shell-receive-story",
    },
    {
      key: "snowridge",
      presetId: "snowridge-wuxia-stage",
      roomId: "room-snowridge-20",
      characterIds: {
        "sx-stage-director": "snow-director",
        "sx-stage-narrator": "snow-narrator",
      },
      targetCharacterId: "snow-narrator",
      eventRounds: [
        { round: 1, type: "story_input_received", target: { type: "scene" } },
        { round: 5, type: "pressure_rises", target: { type: "scene" } },
        { round: 10, type: "action_clarified", target: { type: "scene" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "jianghu_pressure", expected: 50 },
        { scope: { type: "scene" }, statusId: "action_clarity", expected: 70 },
      ],
      completedTaskId: "wuxia-shell-receive-story",
    },
    {
      key: "orbital",
      presetId: "orbital-scifi-stage",
      roomId: "room-orbital-20",
      characterIds: {
        "oa-stage-director": "orbit-director",
        "oa-stage-narrator": "orbit-narrator",
      },
      targetCharacterId: "orbit-narrator",
      eventRounds: [
        { round: 1, type: "story_input_received", target: { type: "scene" } },
        { round: 5, type: "system_warning", target: { type: "scene" } },
        { round: 10, type: "signal_clarified", target: { type: "scene" } },
      ],
      statusChecks: [
        { scope: { type: "scene" }, statusId: "system_pressure", expected: 55 },
        { scope: { type: "scene" }, statusId: "signal_clarity", expected: 60 },
      ],
      completedTaskId: "scifi-shell-receive-story",
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
    };
  };

  globalThis.__tavernPresetTwentyRoundChecks = {
    presets: shellPresetCases.map(runNovelPresetTwentyRounds),
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
      "@engine/agent": resolve(workspaceRoot, "agent-runtime/src/engine/agent"),
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
  assert(Array.isArray(presets) && presets.length === 3, "Shell preset 20-round checks should cover all current default taverns", {
    presetCount: presets?.length,
  });

  for (const preset of presets) {
    assert(preset.room.replyMode === "director", "Shell preset should use director reply mode", {
      presetId: preset.presetId,
      replyMode: preset.room.replyMode,
    });
    assert(preset.orders.length === 20, "Shell preset should run exactly 20 rounds", {
      presetId: preset.presetId,
      rounds: preset.orders.length,
    });
    assert(
      preset.orders.every((order) => order.length > 0),
      "Shell preset scheduling should keep at least one speaker each round",
      { presetId: preset.presetId, orders: preset.orders },
    );
    assert(
      preset.mappedCharacterIds.every((characterId) =>
        preset.orders.some((order) => order.includes(characterId))
      ),
      "Shell preset mapped characters should all appear in 20-round scheduling",
      { presetId: preset.presetId, mappedCharacterIds: preset.mappedCharacterIds, orders: preset.orders },
    );
    assert(
      Object.entries(preset.expectedStatusValues).every(([statusId, expected]) =>
        preset.statusValues[statusId] === expected
      ),
      "Shell preset progress events should update configured statuses",
      {
        presetId: preset.presetId,
        statusValues: preset.statusValues,
        expectedStatusValues: preset.expectedStatusValues,
      },
    );
    assert(
      preset.completedTaskStatus === "completed",
      "Shell preset receive-story task should complete during 20-round progression",
      {
        presetId: preset.presetId,
        taskId: preset.completedTaskId,
        taskStatus: preset.completedTaskStatus,
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
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
