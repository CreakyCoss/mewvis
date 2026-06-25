import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const storyPath = resolve(workspaceRoot, "src/features/story/index.ts");

writeFileSync(entryPath, `
  import {
    acceptStoryManuscriptDraft,
    buildStoryContextPackageFromAsset,
    createDefaultStoryState,
    createEmptyStoryState,
    createStoryAssetFromContextPackage,
    createStoryAssetFromImportDraft,
    createStoryImportDraft,
    getStoryPresentationSeed,
    getStoryBranchDataPackage,
    getStoryNodeDataPackage,
    listStoryManuscriptDrafts,
    mergeStoryImportDraftIntoStory,
    normalizeStoryState,
    submitStoryManuscriptToState,
    updateStoryManuscriptDraft,
    upsertStoryAsset,
  } from ${JSON.stringify(storyPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const workspaceId = "workspace-story-core";
  const defaultStoryState = createDefaultStoryState(workspaceId, 1_800_000_000_000);
  assert(
    defaultStoryState.stories.length === 3 &&
      defaultStoryState.activeStoryId === "story-raincity-silent-manuscript" &&
      defaultStoryState.stories.every((story) => story.workspaceId === workspaceId) &&
      defaultStoryState.stories.every((story) =>
        story.scenes.length >= 3 &&
        story.characters.length >= 4 &&
        story.characters.every((character) => character.avatar) &&
        story.graph.nodes.length >= 3
      ),
    "默认故事应作为故事侧资产提供，而不是默认酒馆房间。",
    defaultStoryState,
  );

  const draft = createStoryImportDraft({
    sourceKind: "json",
    label: "雾港档案",
    description: "故事核心测试草稿。",
    createdAt: 1_800_000_000_000,
    story: {
      title: "雾港档案",
      outline: "潮汐钟停在三点十七分。",
      goal: "找出停摆原因。",
      userPersonaName: "调查人",
    },
    characters: [
      {
        id: "archivist",
        name: "穆青檐",
        description: "档案馆管理员。",
        speakingStyle: "克制，先问证据。",
        memory: "知道三点十七分前后巡检表被改过。",
      },
    ],
    scenes: [
      {
        id: "scene-entry",
        title: "档案馆入口",
        scene: "雨夜，档案馆的潮汐钟停止。",
        goal: "进入档案馆。",
        plot: "调查人抵达入口。",
        direction: "克制悬疑。",
        transition: "进入巡检室。",
        memory: "入口潮气很重。",
        characterIds: ["archivist"],
        activeCharacterId: "archivist",
      },
    ],
    lorebookEntries: [
      {
        id: "lore-clock",
        title: "潮汐钟",
        content: "潮汐钟只会在潮差异常时停摆。",
        keywords: ["潮汐钟"],
        enabled: true,
        alwaysOn: true,
      },
    ],
  });

  const importedStory = createStoryAssetFromImportDraft({
    workspaceId,
    draft,
    timestamp: 1_800_000_000_100,
  });
  assert(
    importedStory.title === "雾港档案" &&
      importedStory.characters[0]?.id === "archivist" &&
      importedStory.characters[0]?.avatar &&
      importedStory.lorebookEntries[0]?.id === "lore-clock" &&
      importedStory.scenes[0]?.id === "scene-entry" &&
      importedStory.graph.nodes.length === 1,
    "导入草稿应创建独立故事资产。",
    importedStory,
  );

  const branchScene = {
    id: "scene-ledger",
    title: "巡检室",
    scene: "巡检表上缺了一页。",
    goal: "核对巡检表。",
    plot: "发现缺页。",
    direction: "把注意力落在证据上。",
    transition: "回到潮汐钟。",
    memory: "缺页边缘有盐渍。",
  };
  const branchNode = {
    id: "node-ledger",
    stageId: "stage-ledger",
    sceneId: branchScene.id,
    title: "巡检表缺页",
    type: "normal" as const,
    pathRole: "main" as const,
    status: "draft" as const,
  };
  const branchEdge = {
    id: "edge-entry-ledger",
    fromNodeId: importedStory.graph.entryNodeId,
    toNodeId: branchNode.id,
    title: "进入巡检室",
    condition: "完成入口检查",
  };
  const storyWithBranch = {
    ...importedStory,
    scenes: [...importedStory.scenes, branchScene],
    graph: {
      ...importedStory.graph,
      activeNodeId: branchNode.id,
      stages: [
        ...importedStory.graph.stages,
        { id: "stage-ledger", title: "证据阶段", order: 1 },
      ],
      nodes: [...importedStory.graph.nodes, branchNode],
      edges: [branchEdge],
    },
  };

  const state = upsertStoryAsset(createEmptyStoryState(), storyWithBranch);
  assert(
    state.activeStoryId === storyWithBranch.id &&
      state.stories.length === 1,
    "upsert 应维护当前故事状态。",
    state,
  );

  const submitted = submitStoryManuscriptToState(state, {
    storyId: storyWithBranch.id,
    nodeId: branchNode.id,
    source: "chat",
    sourceRunId: "chat-run-1",
    sourceMessageIds: ["message-1"],
    title: "巡检表稿件",
    content: "调查人发现巡检表缺页，盐渍说明它曾被带到潮边。",
    summary: "发现巡检表缺页。",
    metadata: { channel: "chat" },
  }, {
    timestamp: 1_800_000_000_200,
  });
  const updatedInbox = updateStoryManuscriptDraft(
    submitted.story.manuscriptInbox,
    submitted.draft.id,
    {
      title: "巡检表缺页稿",
      summary: "确认巡检表缺页。",
      updatedAt: 1_800_000_000_250,
    },
  );
  const pendingDrafts = listStoryManuscriptDrafts(updatedInbox, {
    storyId: storyWithBranch.id,
    nodeId: branchNode.id,
    status: "pending",
  });
  assert(
    pendingDrafts.length === 1 &&
      pendingDrafts[0]?.title === "巡检表缺页稿",
    "稿件收件箱应支持查询和编辑待确认稿。",
    pendingDrafts,
  );

  const acceptedResult = acceptStoryManuscriptDraft(
    updatedInbox,
    submitted.draft.id,
    { acceptedAt: 1_800_000_000_300 },
  );
  const acceptedStory = {
    ...submitted.story,
    manuscriptInbox: acceptedResult.inbox,
    updatedAt: 1_800_000_000_300,
  };
  const nodePackage = getStoryNodeDataPackage(acceptedStory, {
    nodeId: branchNode.id,
  });
  assert(
    nodePackage.scope === "node" &&
      nodePackage.current.node?.id === branchNode.id &&
      nodePackage.current.scene?.id === branchScene.id &&
      nodePackage.current.progress.includes("发现缺页") &&
      nodePackage.current.progress.includes("确认巡检表缺页") &&
      nodePackage.memory.acceptedManuscripts.length === 1 &&
      nodePackage.memory.characterPublicMemories[0]?.memory.includes("巡检表被改过"),
    "节点数据包应包含背景、当前节点进展、角色记忆和已收稿件。",
    nodePackage,
  );

  const branchPackage = getStoryBranchDataPackage(acceptedStory, {
    activeNodeId: branchNode.id,
    pathNodeIds: [importedStory.graph.entryNodeId, branchNode.id],
    pathEdgeIds: [branchEdge.id],
  });
  assert(
    branchPackage.scope === "branch" &&
      branchPackage.branch.pathNodeIds.join(">") ===
        [importedStory.graph.entryNodeId, branchNode.id].join(">") &&
      branchPackage.branch.pathEdgeIds[0] === branchEdge.id &&
      branchPackage.branch.incomingEdges[0]?.id === branchEdge.id,
    "分支数据包应保留路径节点、路径边和当前节点入边。",
    branchPackage,
  );
  const presentationSeed = getStoryPresentationSeed(acceptedStory, {
    nodeId: branchNode.id,
  });
  assert(
    presentationSeed.version === 1 &&
      presentationSeed.story.id === acceptedStory.id &&
      presentationSeed.story.createdAt === acceptedStory.createdAt &&
      presentationSeed.story.updatedAt === acceptedStory.updatedAt &&
      presentationSeed.targetNodeId === branchNode.id &&
      presentationSeed.graph.nodes.length === acceptedStory.graph.nodes.length &&
      presentationSeed.scenes.length === acceptedStory.scenes.length &&
      presentationSeed.characters[0]?.id === "archivist" &&
      presentationSeed.world.lorebookEntries[0]?.id === "lore-clock",
    "故事呈现 seed 应提供呈现层所需的标准故事快照。",
    presentationSeed,
  );

  const context = buildStoryContextPackageFromAsset(acceptedStory, {
    activeNodeId: branchNode.id,
    branch: {
      pathNodeIds: [importedStory.graph.entryNodeId, branchNode.id],
      pathEdgeIds: [branchEdge.id],
    },
  });
  const sourcedStory = createStoryAssetFromContextPackage({
    workspaceId,
    context,
    existing: acceptedStory,
    sourceRef: { channel: "tavern", id: "room-1", label: "雾港酒馆呈现" },
    timestamp: 1_800_000_000_400,
  });
  const resourcedStory = createStoryAssetFromContextPackage({
    workspaceId,
    context,
    existing: sourcedStory,
    sourceRef: { channel: "tavern", id: "room-1", label: "雾港酒馆呈现更新" },
    timestamp: 1_800_000_000_500,
  });
  assert(
    resourcedStory.sourceRefs.length === 1 &&
      resourcedStory.sourceRefs[0]?.channel === "tavern" &&
      resourcedStory.sourceRefs[0]?.label === "雾港酒馆呈现更新",
    "故事来源引用应使用通用 channel，并按 channel/id 去重。",
    resourcedStory.sourceRefs,
  );

  const lorePatch = createStoryImportDraft({
    mode: "lorebookPatch",
    sourceKind: "worldBook",
    label: "补充世界书",
    lorebookEntries: [
      {
        id: "lore-ledger",
        title: "巡检表",
        content: "巡检表由档案馆每日封存。",
        keywords: ["巡检表"],
      },
    ],
  });
  const patchedStory = mergeStoryImportDraftIntoStory(resourcedStory, lorePatch, {
    timestamp: 1_800_000_000_600,
  });
  assert(
    patchedStory.lorebookEntries.some((entry) => entry.id === "lore-ledger") &&
      patchedStory.updatedAt === 1_800_000_000_600,
    "世界书补丁应能合并到既有故事。",
    patchedStory.lorebookEntries,
  );

  const normalizedState = normalizeStoryState(workspaceId, {
    version: 1,
    activeStoryId: patchedStory.id,
    stories: [
      patchedStory,
      { ...patchedStory, id: "other-story", workspaceId: "other-workspace" },
    ],
  });
  assert(
    normalizedState?.activeStoryId === patchedStory.id &&
      normalizedState.stories.length === 1 &&
      normalizedState.stories[0]?.sourceRefs[0]?.channel === "tavern",
    "故事状态归一化应过滤工作区并保留通用来源引用。",
    normalizedState,
  );
`);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundledPath,
    target: "node22",
  });
  await import(pathToFileURL(bundledPath).href);
  console.log("[story-core] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
