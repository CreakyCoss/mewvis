import type {
  StoryProjectDocumentEntry,
  StoryProjectState,
  StoryContext,
  StoryContextSection,
  StoryContextSource,
} from "../../types.js";
import { StoryDefinition } from "../../definitions/index.js";
import type { StoryFieldDefinition } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const objectValue = (entry?: StoryProjectDocumentEntry) => (entry && isObject(entry.value) ? entry.value : undefined);

const stringValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const stringValues = (value: unknown) =>
  Array.isArray(value) ? value.map(stringValue).filter(Boolean) : stringValue(value) ? [stringValue(value)] : [];

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const objectItems = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : []);

const documentId = (value: unknown) => {
  if (!isObject(value)) return "";
  return typeof value.id === "string" ? value.id : typeof value.storyId === "string" ? value.storyId : "";
};

const entryId = (entry?: StoryProjectDocumentEntry) => documentId(entry?.value);

const projectRevision = (project: StoryProjectState) => {
  if (!Number.isInteger(project.manifest.revision)) throw new Error("故事 Manifest 缺少 revision。");
  return Number(project.manifest.revision);
};

const displayScalar = (field: StoryFieldDefinition, value: unknown) => {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return field.options?.find((item) => item.value === value)?.label ?? value;
  return String(value ?? "");
};

const renderFields = (
  definition: StoryTypeDefinition,
  fields: Readonly<Record<string, StoryFieldDefinition>>,
  value: JsonObject,
  indent = "",
) =>
  Object.entries(fields).flatMap(([key, field]): string[] => {
    const item = value[key];
    if (item === undefined || item === null || item === "" || (Array.isArray(item) && item.length === 0)) return [];
    if (["schemaVersion", "kind", "updatedAt", "createdAt"].includes(key)) return [];
    const prefix = `${indent}- ${field.label}：`;
    if (field.definition && isObject(item)) {
      return [
        `${prefix}`,
        ...renderFields(definition, StoryDefinition.objectFields(definition, field.definition), item, `${indent}  `),
      ];
    }
    if (field.itemDefinition && Array.isArray(item)) {
      const objectFields = StoryDefinition.objectFields(definition, field.itemDefinition);
      return [
        `${prefix}`,
        ...item.flatMap((child, index) =>
          isObject(child)
            ? [`${indent}  ${index + 1}.`, ...renderFields(definition, objectFields, child, `${indent}     `)]
            : [`${indent}  ${index + 1}. ${String(child)}`],
        ),
      ];
    }
    if (Array.isArray(item)) return [`${prefix}${item.join("、")}`];
    return [`${prefix}${displayScalar(field, item)}`];
  });

const projectedValue = (value: JsonObject, keys: readonly string[], overrides: JsonObject = {}) =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const item = key in overrides ? overrides[key] : value[key];
      return item === undefined ? [] : [[key, item]];
    }),
  );

const entryHeading = (entry: StoryProjectDocumentEntry) => {
  const value = objectValue(entry);
  if (!value) return "";
  return stringValue(value.title) || stringValue(value.name) || documentId(value);
};

const renderEntry = (
  definition: StoryTypeDefinition,
  entry: StoryProjectDocumentEntry,
  options: Readonly<{ heading?: boolean; keys?: readonly string[]; overrides?: JsonObject }> = {},
) => {
  if (!isObject(entry.value)) return String(entry.value);
  const value = options.keys
    ? projectedValue(entry.value, options.keys, options.overrides)
    : options.overrides
      ? { ...entry.value, ...options.overrides }
      : entry.value;
  const body = renderFields(definition, StoryDefinition.fields(definition, entry.ref.kind), value).join("\n");
  const heading = options.heading === false ? "" : entryHeading(entry);
  return heading && body ? `### ${heading}\n\n${body}` : body;
};

const sourceForEntry = (definition: StoryTypeDefinition, entry: StoryProjectDocumentEntry): StoryContextSource => ({
  kind: entry.ref.kind,
  label: StoryDefinition.document(definition, entry.ref.kind).label,
  ref: entry.ref,
  ...(entryId(entry) ? { id: entryId(entry) } : {}),
});

const uniqueEntries = (entries: readonly (StoryProjectDocumentEntry | undefined)[]) => [
  ...new Map(
    entries
      .filter((entry): entry is StoryProjectDocumentEntry => Boolean(entry))
      .map((entry) => [StoryDefinition.identityKey(entry.ref), entry]),
  ).values(),
];

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const notice = "\n\n[本分区已按章节召回预算截断；如缺少会导致写错的旧事实，应定向补查对应 JSON 文档。]";
  return `${value.slice(0, Math.max(0, maxLength - notice.length)).trimEnd()}${notice}`;
};

const contextSection = (
  definition: StoryTypeDefinition,
  input: Readonly<{
    id: string;
    label: string;
    priority: number;
    required?: boolean;
    content: string;
    entries?: readonly (StoryProjectDocumentEntry | undefined)[];
    maxLength?: number;
  }>,
): StoryContextSection | null => {
  const content = truncateText(input.content.trim(), input.maxLength ?? 12_000);
  if (!content) return null;
  const entries = uniqueEntries(input.entries ?? []);
  return {
    id: input.id,
    label: input.label,
    priority: input.priority,
    required: input.required ?? false,
    content,
    sources: entries.map((entry) => sourceForEntry(definition, entry)),
  };
};

const targetLabel = (target?: StoryProjectDocumentEntry) => {
  const value = objectValue(target);
  if (!value) return "";
  const title = stringValue(value.title);
  const number = numberValue(value.number);
  return title ? (number === null ? title : `第 ${number} 章《${title}》`) : documentId(value);
};

const contextResult = (
  project: StoryProjectState,
  scope: "project" | "chapter",
  label: string,
  target: StoryProjectDocumentEntry | undefined,
  sections: readonly StoryContextSection[],
): StoryContext => {
  const labelForTarget = targetLabel(target);
  const sources = [
    ...new Map(
      sections.flatMap((section) => section.sources).map((source) => [StoryDefinition.identityKey(source.ref), source]),
    ).values(),
  ];
  return {
    scope,
    revision: projectRevision(project),
    target: target ? { kind: target.ref.kind, id: documentId(target.value), label: labelForTarget } : null,
    sections,
    sources,
    text: [
      `# ${label}${labelForTarget ? `：${labelForTarget}` : ""}`,
      ...sections.map((section) => `## ${section.label}\n\n${section.content}`),
    ].join("\n\n"),
  };
};

const readGenericContext = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  input: { scope: "project" | "chapter"; targetId?: string },
) => {
  const view = StoryDefinition.context(definition, input.scope);
  const candidates = project.documents.filter((entry) => view.documentKinds.includes(entry.ref.kind));
  const target =
    input.scope === "chapter" && view.targetKind
      ? candidates.find((entry) => {
          if (entry.ref.kind !== view.targetKind || !isObject(entry.value)) return false;
          const value = entry.value;
          return (view.targetSelectors ?? ["id"]).some(
            (key) => String(value[key] ?? "") === String(input.targetId ?? ""),
          );
        })
      : undefined;
  if (input.scope === "chapter" && !target) throw new Error(`找不到章节上下文目标：${input.targetId ?? ""}`);
  const orderedKinds = [target?.ref.kind ?? "", ...view.documentKinds].filter(
    (kind, index, all) => kind && all.indexOf(kind) === index,
  );
  const sections = orderedKinds.flatMap((kind, index): StoryContextSection[] => {
    const entries = candidates.filter((entry) => entry.ref.kind === kind);
    if (entries.length === 0) return [];
    const content = entries
      .map((entry) => renderEntry(definition, entry, { heading: entries.length > 1 }))
      .join("\n\n");
    const section = contextSection(definition, {
      id: kind,
      label: StoryDefinition.document(definition, kind).label,
      priority: 100 - index,
      required: Boolean(target && entries.some((entry) => entry === target)),
      content,
      entries,
      maxLength: Number.MAX_SAFE_INTEGER,
    });
    return section ? [section] : [];
  });
  return contextResult(project, input.scope, view.label, target, sections);
};

const valuesText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valuesText).join(" ");
  if (isObject(value)) return Object.values(value).map(valuesText).join(" ");
  return "";
};

const textTokens = (value: unknown) => {
  const normalized = valuesText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  const tokens = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) tokens.add(normalized.slice(index, index + 2));
  return tokens;
};

const similarity = (query: Set<string>, value: unknown) => {
  const candidate = textTokens(value);
  if (query.size === 0 || candidate.size === 0) return 0;
  let overlap = 0;
  for (const token of query) if (candidate.has(token)) overlap += 1;
  return overlap / Math.sqrt(query.size * candidate.size);
};

const bestMatch = <T>(items: readonly T[], query: Set<string>) =>
  [...items].sort((left, right) => similarity(query, right) - similarity(query, left))[0];

type BenchmarkSelection = Readonly<{
  entry?: StoryProjectDocumentEntry;
  module?: JsonObject;
  rhythm?: JsonObject;
  emotionalArc: readonly JsonObject[];
  style?: JsonObject;
  techniques: readonly string[];
  gaps: readonly string[];
}>;

const selectBenchmark = (
  entries: readonly StoryProjectDocumentEntry[],
  queryValue: unknown,
  benchmarkTitles: readonly string[],
): BenchmarkSelection => {
  const query = textTokens(queryValue);
  const candidates = entries.filter((entry) => {
    const value = objectValue(entry);
    return value?.target === "benchmark" && value.status !== "draft";
  });
  const titleSet = new Set(benchmarkTitles.map((title) => title.toLowerCase()));
  const entry = [...candidates].sort((left, right) => {
    const score = (candidate: StoryProjectDocumentEntry) => {
      const value = objectValue(candidate)!;
      const source = isObject(value.source) ? value.source : {};
      const sourceTitle = stringValue(source.title).toLowerCase();
      const titleBoost = sourceTitle && titleSet.has(sourceTitle) ? 4 : 0;
      const statusBoost = value.status === "complete" ? 1 : 0;
      return titleBoost + statusBoost + similarity(query, value);
    };
    return score(right) - score(left);
  })[0];
  const value = objectValue(entry);
  if (!value) return { emotionalArc: [], techniques: [], gaps: [] };
  const emotionalArc = objectItems(value.emotionalArc)
    .sort((left, right) => similarity(query, right) - similarity(query, left))
    .slice(0, 3);
  return {
    entry,
    module: bestMatch(objectItems(value.plotModules), query),
    rhythm: bestMatch(objectItems(value.structureStages), query),
    emotionalArc,
    style: isObject(value.styleProfile) ? value.styleProfile : undefined,
    techniques: stringValues(value.reusableTechniques).slice(0, 6),
    gaps: stringValues(value.gaps),
  };
};

const hasSubstantiveStyle = (value?: JsonObject) =>
  Boolean(
    value &&
    ["tone", "sentenceRhythm", "dialogueGuidance", "punctuationGuidance"].some((key) => stringValue(value[key])),
  );

const line = (label: string, value: unknown) => {
  const text = Array.isArray(value) ? stringValues(value).join("；") : stringValue(value);
  return text ? `- ${label}：${text}` : "";
};

const readChapterWritingContext = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  input: { scope: "chapter"; targetId?: string },
): StoryContext => {
  const view = StoryDefinition.context(definition, "chapter");
  const roleKind = (role: string) => definition.roles[role];
  const entriesOf = (role: string) => {
    const kind = roleKind(role);
    return kind ? project.documents.filter((entry) => entry.ref.kind === kind) : [];
  };
  const one = (role: string) => entriesOf(role)[0];
  const planKind = view.targetKind ?? roleKind("chapterPlan");
  const plans = entriesOf("chapterPlan");
  const target = plans.find((entry) => {
    const value = objectValue(entry);
    return (
      entry.ref.kind === planKind &&
      value &&
      (view.targetSelectors ?? ["id"]).some((key) => String(value[key] ?? "") === String(input.targetId ?? ""))
    );
  });
  if (!target) throw new Error(`找不到章节上下文目标：${input.targetId ?? ""}`);
  const targetValue = objectValue(target)!;
  const targetId = entryId(target);
  const targetNumber = numberValue(targetValue.number);

  const results = entriesOf("chapterResult");
  const contents = entriesOf("chapterContent");
  const planById = new Map(plans.map((entry) => [entryId(entry), entry]));
  const resultNumber = (entry: StoryProjectDocumentEntry) => {
    const value = objectValue(entry);
    const direct = numberValue(value?.number);
    if (direct !== null) return direct;
    return numberValue(objectValue(planById.get(stringValue(value?.planId)))?.number);
  };
  const previousPlan = plans.find(
    (entry) => targetNumber !== null && numberValue(objectValue(entry)?.number) === targetNumber - 1,
  );
  const previousResult = previousPlan
    ? results.find((entry) => {
        const value = objectValue(entry);
        return (
          stringValue(value?.planId) === entryId(previousPlan) ||
          resultNumber(entry) === numberValue(objectValue(previousPlan)?.number)
        );
      })
    : undefined;
  const previousContent = previousResult
    ? contents.find((entry) => entryId(entry) === entryId(previousResult) || entryId(entry) === entryId(previousPlan))
    : undefined;
  const currentResult = results.find((entry) => {
    const value = objectValue(entry);
    return stringValue(value?.planId) === targetId || (targetNumber !== null && resultNumber(entry) === targetNumber);
  });
  const currentContent = currentResult
    ? contents.find((entry) => entryId(entry) === entryId(currentResult) || entryId(entry) === targetId)
    : contents.find((entry) => entryId(entry) === targetId);
  const recentResults = [...results]
    .filter((entry) => targetNumber === null || (resultNumber(entry) ?? Number.MAX_SAFE_INTEGER) < targetNumber)
    .sort((left, right) => (resultNumber(left) ?? 0) - (resultNumber(right) ?? 0))
    .slice(-3);

  const beats = objectItems(targetValue.beats);
  const relevantCharacterIds = new Set([
    ...stringValues(targetValue.participantIds),
    ...stringValues(targetValue.appearanceOrder),
    ...beats.flatMap((beat) => stringValues(beat.participantIds)),
  ]);
  const relevantWorldIds = new Set([
    ...stringValues(targetValue.worldRefIds),
    ...beats.flatMap((beat) => stringValues(beat.worldRefIds)),
  ]);
  const book = one("primary");
  const bookValue = objectValue(book);
  if (relevantCharacterIds.size === 0 && stringValue(bookValue?.protagonistId)) {
    relevantCharacterIds.add(stringValue(bookValue?.protagonistId));
  }
  const characters = entriesOf("character")
    .filter((entry) => relevantCharacterIds.has(entryId(entry)))
    .slice(0, 16);
  const characterStates = entriesOf("characterState")
    .filter((entry) => relevantCharacterIds.has(stringValue(objectValue(entry)?.characterId)))
    .slice(0, 16);
  const worldEntries = entriesOf("worldEntry")
    .filter((entry) => relevantWorldIds.has(entryId(entry)))
    .slice(0, 16);

  const volume = entriesOf("volume").find((entry) => {
    const value = objectValue(entry);
    if (entryId(entry) === stringValue(targetValue.volumeId)) return true;
    const start = numberValue(value?.startChapter);
    const end = numberValue(value?.endChapter);
    return targetNumber !== null && start !== null && end !== null && start <= targetNumber && targetNumber <= end;
  });
  const bookArc = one("bookArc");
  const bookArcValue = objectValue(bookArc);
  const currentStage = objectItems(bookArcValue?.stages).find((stage) => {
    const start = numberValue(stage.startChapter);
    const end = numberValue(stage.endChapter);
    return targetNumber !== null && start !== null && end !== null && start <= targetNumber && targetNumber <= end;
  });
  const turningPoints = objectItems(bookArcValue?.keyTurningPoints).filter(
    (point) => stringValue(point.chapterId) === targetId,
  );

  const relationshipsEntry = one("relationships");
  const relationshipsValue = objectValue(relationshipsEntry);
  const relevantRelationships = objectItems(relationshipsValue?.relationships)
    .filter(
      (relationship) =>
        relevantCharacterIds.has(stringValue(relationship.fromCharacterId)) ||
        relevantCharacterIds.has(stringValue(relationship.toCharacterId)),
    )
    .slice(0, 16);

  const foreshadowsEntry = one("foreshadows");
  const foreshadowsValue = objectValue(foreshadowsEntry);
  const activeStatuses = new Set(["planned", "planted", "advanced"]);
  const selectedForeshadows = objectItems(foreshadowsValue?.foreshadows)
    .flatMap((foreshadow) => {
      if (!activeStatuses.has(stringValue(foreshadow.status))) return [];
      const related = stringValues(foreshadow.relatedEntityIds);
      const direct =
        stringValue(foreshadow.plannedPlantChapterId) === targetId ||
        stringValue(foreshadow.expectedResolveChapterId) === targetId ||
        related.some((id) => id === targetId || relevantCharacterIds.has(id) || relevantWorldIds.has(id));
      const importance = stringValue(foreshadow.importance);
      const globallyActive = importance === "high" && foreshadow.status !== "planned";
      if (!direct && !globallyActive) return [];
      return [{ value: foreshadow, score: direct ? 10 : importance === "high" ? 3 : 1 }];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((item) => item.value);

  const recentResultIds = new Set(recentResults.map(entryId));
  const resultNumbersById = new Map(results.map((entry) => [entryId(entry), resultNumber(entry)]));
  const timelineDocuments = entriesOf("timeline");
  const timelineSelections = timelineDocuments.flatMap((entry) => {
    const value = objectValue(entry);
    const selectedEntries = objectItems(value?.entries).filter((timelineEntry) => {
      const chapterId = stringValue(timelineEntry.chapterId);
      const eventChapterNumber = resultNumbersById.get(chapterId) ?? null;
      if (targetNumber !== null && (eventChapterNumber === null || eventChapterNumber > targetNumber)) return false;
      return (
        recentResultIds.has(chapterId) ||
        stringValues(timelineEntry.participantIds).some((id) => relevantCharacterIds.has(id)) ||
        stringValues(timelineEntry.worldRefIds).some((id) => relevantWorldIds.has(id))
      );
    });
    return selectedEntries.length > 0 ? [{ entry, value, selectedEntries }] : [];
  });
  const selectedTimelineEntries = timelineSelections.flatMap((selection) => selection.selectedEntries).slice(-12);
  const timelineSourceEntries = timelineSelections.map((selection) => selection.entry);
  const currentTimeline = timelineSelections.at(-1)?.value ?? objectValue(timelineDocuments.at(-1));

  const positioning = one("positioning");
  const positioningValue = objectValue(positioning);
  const benchmarkTitles = stringValues(positioningValue?.benchmarkTitles);
  const customStyle = one("style");
  const customStyleValue = objectValue(customStyle);
  const benchmarkQuery = {
    primaryGenre: positioningValue?.primaryGenre,
    secondaryGenres: positioningValue?.secondaryGenres,
    chapterRole: targetValue.chapterRole,
    targetEmotion: targetValue.targetEmotion,
    coreEvent: targetValue.coreEvent,
    structureFormula: targetValue.structureFormula,
    payoff: targetValue.payoff,
  };
  const benchmark = selectBenchmark(entriesOf("analysis"), benchmarkQuery, benchmarkTitles);
  const benchmarkValue = objectValue(benchmark.entry);
  const customStyleActive = hasSubstantiveStyle(customStyleValue);
  const benchmarkStyleActive = hasSubstantiveStyle(benchmark.style);
  const benchmarkDeclared = benchmarkTitles.length > 0;
  const missingContracts = [
    targetNumber !== null && targetNumber > 1 && !previousContent ? "上一章正文缺失，不能建立可靠衔接" : "",
    benchmarkDeclared && !benchmark.entry ? "已声明对标作品，但没有可用的 benchmark story-analysis" : "",
    benchmark.entry && !benchmark.module ? "对标分析缺少可选择的剧情模块" : "",
    benchmark.entry && !benchmark.rhythm && benchmark.emotionalArc.length === 0 ? "对标分析缺少节奏/情绪推进依据" : "",
    benchmarkDeclared && !customStyleActive && !benchmarkStyleActive ? "本书文风和对标文风均不可用" : "",
  ].filter(Boolean);

  const genreCard = [
    line("题材边界", [stringValue(positioningValue?.primaryGenre), ...stringValues(positioningValue?.secondaryGenres)]),
    line("目标读者", positioningValue?.targetAudience),
    line("读者情绪承诺", positioningValue?.emotionalPromise),
    line("核心爽点/满足", [stringValue(positioningValue?.surfaceHook), stringValue(positioningValue?.deepPayoff)]),
    line("长期钩子", positioningValue?.longTermHook),
    line("差异化边界", positioningValue?.differentiation),
    line("本章题材取舍", [stringValue(targetValue.coreEvent), stringValue(targetValue.payoff)]),
    "- 卡片来源：根据作品定位 JSON 与本章细纲动态生成；只控制题材味和正文取舍，不覆盖细纲、情绪、节奏或文风。",
  ]
    .filter(Boolean)
    .join("\n");

  const moduleLabel = benchmark.module
    ? [
        stringValue(benchmark.module.name),
        stringValue(benchmark.module.function),
        stringValue(benchmark.module.reusablePattern),
      ]
        .filter(Boolean)
        .join("；")
    : benchmarkDeclared
      ? "缺失"
      : `无对标参考；以本章目标情绪“${stringValue(targetValue.targetEmotion)}”为准`;
  const rhythmLabel = benchmark.rhythm
    ? [
        stringValue(benchmark.rhythm.name),
        stringValue(benchmark.rhythm.function),
        stringValue(benchmark.rhythm.emotion),
      ]
        .filter(Boolean)
        .join("；")
    : benchmark.emotionalArc.length > 0
      ? benchmark.emotionalArc.map((point) => `${stringValue(point.label)}：${stringValue(point.cause)}`).join("；")
      : `按本章结构公式“${stringValue(targetValue.structureFormula)}”与 beats 字数预算执行`;
  const styleLabel = customStyleActive
    ? "本书 story-style 为权威文风；对标文风仅提供锚点和数值参考"
    : benchmarkStyleActive
      ? "使用选中对标分析的 styleProfile"
      : "无可用文风画像，使用基础正文门槛";
  const techniqueLabel = benchmark.techniques.length > 0 ? benchmark.techniques.join("；") : "无独立匹配章技法";
  const prepareStatus = missingContracts.length > 0 ? `阻塞：${missingContracts.join("；")}` : "可写作";
  const chapterBrief = [
    line("准备状态", prepareStatus),
    line("章节任务", `${targetLabel(target)}；${stringValue(targetValue.coreEvent)}`),
    line("情绪目标", targetValue.targetEmotion),
    line("节奏骨架", targetValue.structureFormula),
    line("selected_emotion_module", moduleLabel),
    line("rhythm_reference", rhythmLabel),
    line("genre_prose_card", genreCard.replace(/\n- /g, "；")),
    line("style_directive", styleLabel),
    line("matched_chapter_techniques", techniqueLabel),
    line("禁止提前释放", targetValue.releaseGuards),
    line("章尾承接", isObject(targetValue.ending) ? targetValue.ending.nextDrive : ""),
    benchmark.gaps.length > 0 ? line("分析证据缺口", benchmark.gaps) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const progress = one("progress");
  const progressValue = objectValue(progress);
  const characterNames = new Map(
    characters.map((entry) => [entryId(entry), stringValue(objectValue(entry)?.name) || entryId(entry)]),
  );
  const stateByCharacter = new Map(
    characterStates.map((entry) => [stringValue(objectValue(entry)?.characterId), entry]),
  );
  const characterStateDigest = characters
    .map((entry) => {
      const id = entryId(entry);
      const state = objectValue(stateByCharacter.get(id));
      const profile = objectValue(entry);
      return [
        `### ${characterNames.get(id)}`,
        line("身份", state?.identity || profile?.role),
        line("位置", state?.location),
        line("身体", state?.physicalState),
        line("能力", state?.abilities),
        line("关系", state?.relationshipStates),
        line("已知信息", state?.knowledge),
        line("未解决事项", state?.openThreads),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  const recentDigest = recentResults
    .map((entry) => {
      const value = objectValue(entry);
      return `- 第 ${String(value?.number ?? "?")} 章《${stringValue(value?.title) || entryId(entry)}》：${stringValue(value?.summary)}`;
    })
    .join("\n");
  const previousEnding = objectValue(previousPlan)?.ending;
  const continuationState = [
    "### 当前位置",
    line("故事时间", currentTimeline?.currentTime),
    line("最后完成章节", progressValue?.lastCompletedChapterId),
    line("当前分卷", progressValue?.currentVolumeId || entryId(volume)),
    "",
    "### 长期约束",
    line("全书阶段禁区", currentStage?.prohibitedReveals),
    line("分卷禁区", objectValue(volume)?.prohibitedReveals),
    line("本章禁区", targetValue.releaseGuards),
    "",
    "### 核心角色状态",
    characterStateDigest || "- 本章细纲未引用可用角色状态。",
    "",
    "### 活跃伏笔",
    selectedForeshadows.length > 0
      ? selectedForeshadows
          .map(
            (item) => `- ${stringValue(item.content)}（${stringValue(item.status)} / ${stringValue(item.importance)}）`,
          )
          .join("\n")
      : "- 无与本章直接相关的活跃伏笔。",
    "",
    "### 近三章速记",
    recentDigest || "- 尚无已完成章节摘要。",
    "",
    "### 下一章承诺",
    line("上一章留下的驱动力", isObject(previousEnding) ? previousEnding.nextDrive : ""),
    line("本章必须兑现", [stringValue(targetValue.openingHook), stringValue(targetValue.payoff)]),
    "",
    "### 连贯性风险",
    line("进度备注", progressValue?.notes),
    missingContracts.length > 0 ? line("写前缺口", missingContracts) : "- 当前结构化资料未发现阻塞性缺口。",
  ]
    .filter((item, index, all) => item !== "" || all[index - 1] !== "")
    .join("\n");

  const boundaries = [
    book
      ? [
          "### 全书边界",
          renderEntry(definition, book, {
            heading: false,
            keys: ["premise", "goal", "centralConflict", "finalObstacle"],
          }),
        ].join("\n\n")
      : "",
    bookArc && bookArcValue
      ? [
          "### 当前全书阶段",
          renderEntry(definition, bookArc, {
            heading: false,
            keys: ["emotionalArc", "stages", "keyTurningPoints"],
            overrides: {
              stages: currentStage ? [currentStage] : [],
              keyTurningPoints: turningPoints,
            },
          }),
        ].join("\n\n")
      : "",
    volume
      ? [
          "### 当前分卷契约",
          renderEntry(definition, volume, {
            heading: false,
            keys: [
              "number",
              "title",
              "phase",
              "purpose",
              "coreConflict",
              "coreEvent",
              "startState",
              "endState",
              "emotionalArc",
              "allowedReveals",
              "prohibitedReveals",
            ],
          }),
        ].join("\n\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const previousChapterText = previousContent
    ? [
        previousResult ? renderEntry(definition, previousResult) : "",
        renderEntry(definition, previousContent, { heading: false }),
      ]
        .filter(Boolean)
        .join("\n\n")
    : previousResult
      ? renderEntry(definition, previousResult)
      : "";
  const currentChapterText = currentContent
    ? [
        currentResult ? renderEntry(definition, currentResult) : "",
        renderEntry(definition, currentContent, { heading: false }),
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";
  const characterContext = characters
    .map((entry) => {
      const state = stateByCharacter.get(entryId(entry));
      return [renderEntry(definition, entry), state ? renderEntry(definition, state, { heading: false }) : ""]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  const relationshipContext =
    relationshipsEntry && relevantRelationships.length > 0
      ? renderEntry(definition, relationshipsEntry, {
          heading: false,
          keys: ["relationships"],
          overrides: { relationships: relevantRelationships },
        })
      : "";
  const foreshadowContext =
    foreshadowsEntry && selectedForeshadows.length > 0
      ? renderEntry(definition, foreshadowsEntry, {
          heading: false,
          keys: ["foreshadows"],
          overrides: { foreshadows: selectedForeshadows },
        })
      : "";
  const timelineContext = [
    line("历法", currentTimeline?.calendar),
    line("开场时间", currentTimeline?.openingTime),
    line("当前时间", currentTimeline?.currentTime),
    ...selectedTimelineEntries.map(
      (item) => `- ${stringValue(item.storyTime)}：${stringValue(item.event)}（章节 ${stringValue(item.chapterId)}）`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
  const styleContext = [
    customStyleActive && customStyle
      ? `### 本书权威文风\n\n${renderEntry(definition, customStyle, { heading: false })}`
      : "",
    benchmark.entry && benchmark.style
      ? `### 对标文风参考\n\n${renderEntry(definition, benchmark.entry, {
          heading: false,
          keys: ["styleProfile"],
          overrides: { styleProfile: benchmark.style },
        })}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const benchmarkContext =
    benchmark.entry && benchmarkValue
      ? renderEntry(definition, benchmark.entry, {
          heading: false,
          keys: ["source", "summary", "structureStages", "emotionalArc", "plotModules", "reusableTechniques", "gaps"],
          overrides: {
            structureStages: benchmark.rhythm ? [benchmark.rhythm] : [],
            emotionalArc: benchmark.emotionalArc,
            plotModules: benchmark.module ? [benchmark.module] : [],
            reusableTechniques: benchmark.techniques,
            gaps: benchmark.gaps,
          },
        })
      : benchmarkDeclared
        ? "已声明对标作品，但当前 JSON 项目中没有完成或部分完成的 benchmark story-analysis。"
        : "当前作品未声明对标书；情绪与节奏使用本书卷纲、细纲和题材定位。";

  const sectionInputs = [
    {
      id: "chapter-brief",
      label: "本章写作简报",
      priority: 120,
      required: true,
      content: chapterBrief,
      entries: [target, volume, positioning, customStyle, benchmark.entry],
      maxLength: 6_000,
    },
    {
      id: "chapter-plan",
      label: "当前章节细纲",
      priority: 119,
      required: true,
      content: renderEntry(definition, target, { heading: false }),
      entries: [target],
      maxLength: 12_000,
    },
    {
      id: "story-boundaries",
      label: "全书阶段与分卷边界",
      priority: 118,
      required: true,
      content: boundaries,
      entries: [book, bookArc, volume],
      maxLength: 8_000,
    },
    {
      id: "continuity-state",
      label: "续写状态卡",
      priority: 117,
      required: true,
      content: continuationState,
      entries: [
        progress,
        previousPlan,
        ...recentResults,
        ...characters,
        ...characterStates,
        foreshadowsEntry,
        ...timelineSourceEntries,
      ],
      maxLength: 12_288,
    },
    {
      id: "previous-chapter",
      label: "上一章正文与结果",
      priority: 116,
      required: Boolean(previousContent || previousResult),
      content: previousChapterText,
      entries: [previousPlan, previousResult, previousContent],
      maxLength: 20_000,
    },
    {
      id: "current-chapter-content",
      label: "本章已有正文（仅续写或重写使用）",
      priority: 115,
      required: Boolean(currentContent),
      content: currentChapterText,
      entries: [currentResult, currentContent],
      maxLength: 20_000,
    },
    {
      id: "relevant-characters",
      label: "本章相关角色与当前状态",
      priority: 110,
      content: characterContext,
      entries: [...characters, ...characterStates],
      maxLength: 12_000,
    },
    {
      id: "relevant-world",
      label: "本章相关世界规则",
      priority: 109,
      content: worldEntries.map((entry) => renderEntry(definition, entry)).join("\n\n"),
      entries: worldEntries,
      maxLength: 8_000,
    },
    {
      id: "relevant-relationships",
      label: "本章相关角色关系",
      priority: 108,
      content: relationshipContext,
      entries: relevantRelationships.length > 0 ? [relationshipsEntry] : [],
      maxLength: 6_000,
    },
    {
      id: "relevant-foreshadows",
      label: "本章相关活跃伏笔",
      priority: 107,
      content: foreshadowContext,
      entries: selectedForeshadows.length > 0 ? [foreshadowsEntry] : [],
      maxLength: 6_000,
    },
    {
      id: "relevant-timeline",
      label: "本章相关时间线",
      priority: 106,
      content: timelineContext,
      entries: timelineSourceEntries,
      maxLength: 6_000,
    },
    {
      id: "genre-prose-card",
      label: "题材正文提示卡",
      priority: 105,
      content: genreCard,
      entries: [positioning, target],
      maxLength: 4_000,
    },
    {
      id: "style-directive",
      label: "本章文风指令与锚点",
      priority: 104,
      content: styleContext,
      entries: [customStyleActive ? customStyle : undefined, benchmark.entry],
      maxLength: 10_000,
    },
    {
      id: "benchmark-writing-reference",
      label: "定向对标写作参考",
      priority: 103,
      content: benchmarkContext,
      entries: [benchmark.entry],
      maxLength: 10_000,
    },
  ];
  const sections = sectionInputs.flatMap((sectionInput) => {
    const section = contextSection(definition, sectionInput);
    return section ? [section] : [];
  });
  return contextResult(project, "chapter", view.label, target, sections);
};

/**
 * 将项目 JSON 快照投影为 Agent 与写作酒馆共用的上下文。
 * 项目摘要保持按定义展开；章节写作则复刻原写作技能的定向召回，不扫描工作区 Markdown。
 */
export const readStoryProjectContext = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  input: { scope: "project" | "chapter"; targetId?: string },
): StoryContext => {
  if (input.scope === "chapter" && definition.roles.chapterPlan && definition.roles.chapterResult) {
    return readChapterWritingContext(project, definition, { ...input, scope: "chapter" });
  }
  return readGenericContext(project, definition, input);
};
