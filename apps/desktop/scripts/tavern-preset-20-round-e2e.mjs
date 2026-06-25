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
    assignTavernRoleFacts,
    filterTavernFactEventsForAudience,
    getTavernStatusSnapshotValue,
    isTavernDirectorOnlyTurnAllowed,
    isTavernFixedOrderPhase,
    orderTavernRoundParticipants,
    resolveTavernScheduledSpeakers,
    setTavernStatusSnapshotValue,
    shouldSuppressTavernAutoContinuation,
  } from ${JSON.stringify(corePath)};
  import { createTavernRoomFromSystemPreset } from ${JSON.stringify(systemPresetRoomPath)};

  const baseNow = 1_800_000_000_000;
  const userRef = { type: "user", userId: "user" };

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

  const statusOf = (room, characterId, statusId) =>
    getTavernStatusSnapshotValue(
      room.statusSnapshot,
      { type: "character", characterId },
      statusId,
    );

  const favorOf = (room, subject, object) =>
    getTavernStatusSnapshotValue(
      room.statusSnapshot,
      { type: "relationship", subject, object },
      "favorability",
    );

  const firstPositiveStep = () => {
    let value = 0.11;
    return () => {
      value = (value + 0.37) % 1;
      return value;
    };
  };

  const runWerewolfTwentyRounds = () => {
    const materialized = materializePreset(
      "moonlit-werewolf-table",
      {
        "qiao-yu": "wolf-qiao",
        "shen-mo": "wolf-shen",
        "tan-luo": "wolf-tan",
        "lin-yao": "wolf-lin",
        "bai-shan": "wolf-bai",
      },
      "room-werewolf-20",
    );
    let room = materialized.room;
    const characters = materialized.characters;
    const messages = [...materialized.messages];
    const orders = [];
    const eliminatedCharacterId = "wolf-shen";

    const roleFacts = assignTavernRoleFacts({
      room,
      characters,
      random: firstPositiveStep(),
      turnId: "werewolf-role-assignment",
      createdAt: baseNow + 10,
    });
    room = { ...room, factEvents: roleFacts };
    const directorOnlyAtNight = isTavernDirectorOnlyTurnAllowed(room);
    const nightScheduledSpeakerIds = resolveTavernScheduledSpeakers({
      room,
      availableCharacters: characters,
      activeCharacterId: room.activeCharacterId,
      directorSpeakerIds: ["wolf-qiao"],
      selectedTargetCharacterIds: [],
      fallbackCharacter: characters[0],
    }).map((speaker) => speaker.id);
    room = {
      ...room,
      statusSnapshot: setTavernStatusSnapshotValue(
        room.statusSnapshot,
        { type: "global" },
        "werewolf_phase",
        "day_discussion",
      ),
    };
    const fixedOrderDuringDayDiscussion = isTavernFixedOrderPhase(room);
    const suppressContinuationDuringDayDiscussion = shouldSuppressTavernAutoContinuation(room);
    const openingConfig = room.settings.informationPolicy.roleAssignment.opening;
    const participantOrderBeforeElimination = orderTavernRoundParticipants({
      room,
      characters,
      activeCharacterId: room.activeCharacterId,
      includeUser: room.settings.directorScheduling.fixedOrder.includeUser,
      userPosition: room.settings.directorScheduling.fixedOrder.userPosition,
      userPersonaName: room.userPersonaName,
    }).map((participant) => participant.id);

    for (let round = 1; round <= 20; round += 1) {
      const turnId = \`werewolf-turn-\${round}\`;
      const createdAt = baseNow + round * 1_000;
      messages.push(createMessage({
        id: \`werewolf-user-\${round}\`,
        room,
        role: "user",
        content: \`第 \${round} 轮，我要求所有存活者按顺序说出可公开证词。\`,
        turnId,
        createdAt,
      }));

      const speakers = resolveTavernScheduledSpeakers({
        room,
        availableCharacters: characters,
        activeCharacterId: room.activeCharacterId,
        directorSpeakerIds: ["wolf-tan"],
        selectedTargetCharacterIds: ["wolf-lin"],
        fallbackCharacter: characters[0],
      });
      orders.push(speakers.map((speaker) => speaker.id));
      for (const [speakerIndex, speaker] of speakers.entries()) {
        messages.push(createMessage({
          id: \`werewolf-\${round}-speaker-\${speaker.id}\`,
          room,
          role: "character",
          characterId: speaker.id,
          content: \`\${speaker.name}第 \${round} 轮只回应公开发言，不替任何人宣布身份。\`,
          thought: \`\${speaker.name}保留自己的未公开判断。\`,
          turnId,
          createdAt: createdAt + speakerIndex + 1,
        }));
      }

      const factEvents = [];
      if (round === 6) {
        factEvents.push({
          id: "werewolf-fact-eliminate-shen",
          turnId,
          sourceMessageIds: [\`werewolf-\${round}-speaker-\${eliminatedCharacterId}\`],
          type: "player_eliminated",
          target: { type: "character", characterId: eliminatedCharacterId },
          evidence: "第 6 轮投票公开结算：沈墨出局，之后不能继续白天发言。",
          confidence: 0.98,
          visibility: "public",
          createdAt: createdAt + 200,
        });
      }
      if (round === 20) {
        factEvents.push({
          id: "werewolf-fact-expose-wolf",
          turnId,
          sourceMessageIds: [\`werewolf-user-\${round}\`],
          type: "wolf_exposed",
          target: { type: "character", characterId: "wolf-tan" },
          evidence: "第 20 轮公开证词完成闭环，狼人身份被确认。",
          confidence: 0.96,
          visibility: "public",
          createdAt: createdAt + 210,
        });
      }

      if (factEvents.length > 0) {
        room = applyProgressPatch(
          room,
          advanceTavernProgressFromFactEvents({
            room,
            factEvents,
            turnId,
            createdAt: createdAt + 300,
          }),
        );
        room = {
          ...room,
          statusSnapshot: setTavernStatusSnapshotValue(
            room.statusSnapshot,
            { type: "global" },
            "werewolf_phase",
            "day_discussion",
          ),
        };
      }
    }

    const participantOrderAfterElimination = orderTavernRoundParticipants({
      room,
      characters,
      activeCharacterId: room.activeCharacterId,
      includeUser: room.settings.directorScheduling.fixedOrder.includeUser,
      userPosition: room.settings.directorScheduling.fixedOrder.userPosition,
      userPersonaName: room.userPersonaName,
    }).map((participant) => participant.id);

    return {
      room,
      characters,
      messages,
      roleFacts,
      directorRoleFactsCount: filterTavernFactEventsForAudience({
        factEvents: roleFacts,
        room,
        audience: { type: "director" },
      }).length,
      userVisibleRoleFactsCount: filterTavernFactEventsForAudience({
        factEvents: roleFacts,
        room,
        audience: { type: "user" },
      }).length,
      publicRoleFactsCount: filterTavernFactEventsForAudience({
        factEvents: roleFacts,
        room,
        audience: { type: "public" },
      }).length,
      orders,
      directorOnlyAtNight,
      nightScheduledSpeakerIds,
      fixedOrderDuringDayDiscussion,
      suppressContinuationDuringDayDiscussion,
      openingConfig,
      participantOrderBeforeElimination,
      participantOrderAfterElimination,
      eliminatedCharacterId,
      eliminatedPlayerState: statusOf(room, eliminatedCharacterId, "player_state"),
    };
  };

  const runWinTheirHeartsTwentyRounds = () => {
    const materialized = materializePreset(
      "win-their-hearts-duel",
      {
        "ye-xiaoman": "route-ye",
        "liu-qingshuang": "route-liu",
      },
      "room-win-hearts-20",
    );
    let room = materialized.room;
    const characters = materialized.characters;
    const messages = [...materialized.messages];
    const yeRef = { type: "character", characterId: "route-ye" };
    const liuRef = { type: "character", characterId: "route-liu" };
    const yeFavorByRound = [];
    const targetCanStaySilentSpeakerIds = resolveTavernScheduledSpeakers({
      room,
      availableCharacters: characters,
      activeCharacterId: room.activeCharacterId,
      directorSpeakerIds: [],
      selectedTargetCharacterIds: ["route-ye"],
      fallbackCharacter: characters[0],
    }).map((speaker) => speaker.id);
    const motivatedOtherSpeakerIds = resolveTavernScheduledSpeakers({
      room,
      availableCharacters: characters,
      activeCharacterId: room.activeCharacterId,
      directorSpeakerIds: ["route-liu"],
      selectedTargetCharacterIds: ["route-ye"],
      fallbackCharacter: characters[0],
    }).map((speaker) => speaker.id);
    const nonverbalCueSpeakerIds = resolveTavernScheduledSpeakers({
      room,
      availableCharacters: characters,
      activeCharacterId: room.activeCharacterId,
      directorSpeakerIds: ["route-ye"],
      selectedTargetCharacterIds: ["route-ye"],
      currentUserText: "叶小满，你不用回答，只用动作表示是否不快。",
      fallbackCharacter: characters[0],
    }).map((speaker) => speaker.id);
    const directorNonverbalSpeakerIds = resolveTavernScheduledSpeakers({
      room,
      availableCharacters: characters,
      activeCharacterId: room.activeCharacterId,
      directorSpeakerIds: [],
      directorNonverbalReplyIds: ["route-ye"],
      selectedTargetCharacterIds: [],
      currentUserText: "小满，你不用回答。",
      fallbackCharacter: characters[0],
    }).map((speaker) => speaker.id);

    for (let round = 1; round <= 20; round += 1) {
      const turnId = \`hearts-turn-\${round}\`;
      const createdAt = baseNow + round * 1_000;
      messages.push(createMessage({
        id: \`hearts-user-\${round}\`,
        room,
        role: "user",
        content: \`第 \${round} 轮，我用一个具体行动支持叶小满的店长计划，同时礼貌回应柳青霜。\`,
        turnId,
        createdAt,
      }));
      const scriptedSpeakers = round % 4 === 0
        ? characters
        : characters.filter((character) => character.id === "route-ye");
      for (const [speakerIndex, speaker] of scriptedSpeakers.entries()) {
        messages.push(createMessage({
          id: \`hearts-\${round}-speaker-\${speaker.id}\`,
          room,
          role: "character",
          characterId: speaker.id,
          content: \`\${speaker.name}第 \${round} 轮按自己的人设回应，不替另一位角色做决定。\`,
          turnId,
          createdAt: createdAt + speakerIndex + 1,
        }));
      }

      room = applyProgressPatch(
        room,
        advanceTavernProgressFromFactEvents({
          room,
          factEvents: [{
            id: \`hearts-fact-help-ye-\${round}\`,
            turnId,
            sourceMessageIds: [\`hearts-user-\${round}\`],
            type: "help",
            actor: userRef,
            target: yeRef,
            value: 4,
            evidence: \`第 \${round} 轮用户提供了明确、可观察的支持行动。\`,
            confidence: 0.95,
            visibility: "public",
            createdAt: createdAt + 200,
          }],
          turnId,
          createdAt: createdAt + 300,
        }),
      );
      yeFavorByRound.push(favorOf(room, yeRef, userRef));
    }

    return {
      room,
      characters,
      messages,
      yeRef,
      liuRef,
      yeFavorByRound,
      targetCanStaySilentSpeakerIds,
      motivatedOtherSpeakerIds,
      nonverbalCueSpeakerIds,
      directorNonverbalSpeakerIds,
      yeFavorFinal: favorOf(room, yeRef, userRef),
      liuFavorFinal: favorOf(room, liuRef, userRef),
      reverseYeFavor: favorOf(room, userRef, yeRef),
    };
  };

  globalThis.__tavernPresetTwentyRoundChecks = {
    werewolf: runWerewolfTwentyRounds(),
    winTheirHearts: runWinTheirHeartsTwentyRounds(),
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

  const { werewolf, winTheirHearts } = checks;
  assert(werewolf.room.replyMode === "director", "Werewolf preset must use director reply mode", {
    replyMode: werewolf.room.replyMode,
  });
  assert(werewolf.directorOnlyAtNight, "Werewolf night phase should allow director-only turns");
  assert(
    werewolf.nightScheduledSpeakerIds.length === 0,
    "Werewolf director-only night should force an empty speaker queue",
    { nightScheduledSpeakerIds: werewolf.nightScheduledSpeakerIds },
  );
  assert(werewolf.fixedOrderDuringDayDiscussion, "Werewolf day discussion should be a fixed-order phase");
  assert(
    werewolf.suppressContinuationDuringDayDiscussion,
    "Werewolf day discussion should suppress automatic continuation",
  );
  assert(
    werewolf.openingConfig.autoStart &&
      werewolf.openingConfig.publicEventType === "phase_started" &&
      werewolf.openingConfig.publicEventValue === "day_discussion",
    "Werewolf preset should declare generic director role-assignment opening behavior",
    { openingConfig: werewolf.openingConfig },
  );
  assert(
    werewolf.participantOrderBeforeElimination.join("|") === "user|wolf-qiao|wolf-shen|wolf-tan|wolf-lin|wolf-bai",
    "Werewolf fixed-order participants should include the user as the first seat before NPC speeches",
    { participantOrderBeforeElimination: werewolf.participantOrderBeforeElimination },
  );
  assert(
    werewolf.participantOrderAfterElimination.join("|") === "user|wolf-qiao|wolf-tan|wolf-lin|wolf-bai",
    "Werewolf fixed-order participants should keep the user seat and skip eliminated characters",
    { participantOrderAfterElimination: werewolf.participantOrderAfterElimination },
  );
  assert(werewolf.roleFacts.length === 6, "Werewolf role assignment should cover user plus 5 characters", {
    roleFactCount: werewolf.roleFacts.length,
  });
  assert(
    werewolf.directorRoleFactsCount === 6,
    "Director should see all generated werewolf role facts",
  );
  assert(
    werewolf.userVisibleRoleFactsCount >= 1 && werewolf.userVisibleRoleFactsCount < 6,
    "User should only see their allowed private role facts before reveal",
    { userVisibleRoleFactCount: werewolf.userVisibleRoleFactsCount },
  );
  assert(werewolf.publicRoleFactsCount === 0, "Public view must not see hidden werewolf role facts", {
    publicRoleFactCount: werewolf.publicRoleFactsCount,
  });
  assert(
    werewolf.orders.slice(0, 6).every((order) =>
      order.join("|") === "wolf-qiao|wolf-shen|wolf-tan|wolf-lin|wolf-bai"
    ),
    "Werewolf fixed-order day discussion should use seat order before elimination",
    { orders: werewolf.orders.slice(0, 6) },
  );
  assert(
    werewolf.orders.slice(6).every((order) =>
      order.join("|") === "wolf-qiao|wolf-tan|wolf-lin|wolf-bai"
    ),
    "Eliminated werewolf player should be skipped after the elimination round in fixed order",
    { ordersAfterElimination: werewolf.orders.slice(6, 10) },
  );
  assert(
    werewolf.eliminatedPlayerState === "eliminated",
    "Werewolf elimination fact should update player_state",
    {
      playerState: werewolf.eliminatedPlayerState,
    },
  );
  assert(
    werewolf.room.taskSnapshot["identify-wolves"]?.status === "completed",
    "Werewolf 20th round should complete identify-wolves task",
    { taskSnapshot: werewolf.room.taskSnapshot },
  );
  assert(
    werewolf.room.outcomeEvents.some((event) => event.outcomeId === "villagers-win"),
    "Werewolf 20th round should produce villagers-win outcome event",
    { outcomeEvents: werewolf.room.outcomeEvents },
  );

  assert(
    winTheirHearts.room.replyMode === "director",
    "Win-their-hearts preset should use director reply mode",
    { replyMode: winTheirHearts.room.replyMode },
  );
  assert(
    winTheirHearts.targetCanStaySilentSpeakerIds.length === 0,
    "Prefer target policy should allow a directly addressed character to stay silent or react nonverbally",
    { targetCanStaySilentSpeakerIds: winTheirHearts.targetCanStaySilentSpeakerIds },
  );
  assert(
    winTheirHearts.motivatedOtherSpeakerIds.join("|") === "route-liu",
    "Prefer target policy should allow a motivated non-target character to speak without forcing the target to speak",
    { motivatedOtherSpeakerIds: winTheirHearts.motivatedOtherSpeakerIds },
  );
  assert(
    winTheirHearts.nonverbalCueSpeakerIds.join("|") === "route-ye",
    "Explicit nonverbal target cues should schedule the addressed character for a nonverbal character reply",
    { nonverbalCueSpeakerIds: winTheirHearts.nonverbalCueSpeakerIds },
  );
  assert(
    winTheirHearts.directorNonverbalSpeakerIds.join("|") === "route-ye",
    "Director nonverbalReplyIds should schedule the addressed character even without a UI-selected target",
    { directorNonverbalSpeakerIds: winTheirHearts.directorNonverbalSpeakerIds },
  );
  assert(
    winTheirHearts.yeFavorByRound.length === 20,
    "Win-their-hearts test should run exactly 20 rounds",
    { rounds: winTheirHearts.yeFavorByRound.length },
  );
  assert(
    winTheirHearts.yeFavorByRound.every((value, index) => value === 24 + index * 4),
    "Ye favorability should rise predictably by explicit help events",
    { yeFavorByRound: winTheirHearts.yeFavorByRound },
  );
  assert(
    winTheirHearts.yeFavorFinal === 100,
    "Ye -> user favorability should reach 100 after 20 rounds",
    {
      value: winTheirHearts.yeFavorFinal,
    },
  );
  assert(
    winTheirHearts.liuFavorFinal === 20,
    "Liu -> user favorability should remain at the preset baseline",
    {
      value: winTheirHearts.liuFavorFinal,
    },
  );
  assert(
    winTheirHearts.reverseYeFavor === null,
    "Relationship update must not be written in the reverse user -> Ye direction",
    {
      reverseValue: winTheirHearts.reverseYeFavor,
    },
  );
  assert(
    winTheirHearts.room.taskSnapshot["win-ye-xiaoman-heart"]?.status === "completed",
    "Ye route task should complete when Ye -> user favorability reaches 100",
    { taskSnapshot: winTheirHearts.room.taskSnapshot },
  );
  assert(
    winTheirHearts.room.taskSnapshot["win-liu-qingshuang-heart"]?.status !== "completed",
    "Liu route task should not complete when only Ye was helped",
    { taskSnapshot: winTheirHearts.room.taskSnapshot },
  );
  assert(
    winTheirHearts.room.outcomeEvents.some((event) => event.outcomeId === "ye-route-clear"),
    "Ye route clear outcome should be emitted",
    { outcomeEvents: winTheirHearts.room.outcomeEvents },
  );
  assert(
    !winTheirHearts.room.outcomeEvents.some((event) => event.outcomeId === "liu-route-clear"),
    "Liu route outcome should not be emitted",
    { outcomeEvents: winTheirHearts.room.outcomeEvents },
  );

  const summary = {
    ok: true,
    werewolf: {
      rounds: werewolf.orders.length,
      roleFacts: werewolf.roleFacts.length,
      publicRoleFacts: werewolf.publicRoleFactsCount,
      userVisibleRoleFacts: werewolf.userVisibleRoleFactsCount,
      directorOnlyAtNight: werewolf.directorOnlyAtNight,
      nightScheduledSpeakerIds: werewolf.nightScheduledSpeakerIds,
      fixedOrderDuringDayDiscussion: werewolf.fixedOrderDuringDayDiscussion,
      suppressContinuationDuringDayDiscussion: werewolf.suppressContinuationDuringDayDiscussion,
      openingConfig: werewolf.openingConfig,
      participantOrderBeforeElimination: werewolf.participantOrderBeforeElimination,
      participantOrderAfterElimination: werewolf.participantOrderAfterElimination,
      ordersBeforeElimination: werewolf.orders.slice(0, 2),
      orderAfterElimination: werewolf.orders[6],
      eliminatedPlayerState: werewolf.eliminatedPlayerState,
      completedTask: werewolf.room.taskSnapshot["identify-wolves"]?.status,
      outcomes: werewolf.room.outcomeEvents.map((event) => event.outcomeId),
    },
    winTheirHearts: {
      rounds: winTheirHearts.yeFavorByRound.length,
      yeFavorFinal: winTheirHearts.yeFavorFinal,
      liuFavorFinal: winTheirHearts.liuFavorFinal,
      reverseYeFavor: winTheirHearts.reverseYeFavor,
      targetCanStaySilentSpeakerIds: winTheirHearts.targetCanStaySilentSpeakerIds,
      motivatedOtherSpeakerIds: winTheirHearts.motivatedOtherSpeakerIds,
      nonverbalCueSpeakerIds: winTheirHearts.nonverbalCueSpeakerIds,
      directorNonverbalSpeakerIds: winTheirHearts.directorNonverbalSpeakerIds,
      completedTasks: Object.fromEntries(
        Object.entries(winTheirHearts.room.taskSnapshot).map(([key, value]) => [key, value.status]),
      ),
      outcomes: winTheirHearts.room.outcomeEvents.map((event) => event.outcomeId),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
