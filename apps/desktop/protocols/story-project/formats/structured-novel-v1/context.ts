import type { StoryProjectApi } from "../../protocol.js";
import type { StoryProject } from "./schema.js";
import { validateStoryProject } from "./validation.js";

type ResolvedContextView = ReturnType<StoryProjectApi["contextView"]>;

export const buildProjectSummary = (project: StoryProject, contract: StoryProjectApi, view: ResolvedContextView) => ({
  contextView: { name: view.name },
  revision: project.manifest.revision,
  book: project.book,
  positioning: project.positioning,
  style: project.style,
  arc: project.bookArc,
  volumes: (view.documentKinds.includes("story-volume") ? project.volumes : []).map((volume) => ({
    id: volume.id,
    number: volume.number,
    title: volume.title,
    startChapter: volume.startChapter,
    endChapter: volume.endChapter,
    phase: volume.phase,
    purpose: volume.purpose,
    coreConflict: volume.coreConflict,
  })),
  chapters: (view.documentKinds.includes("story-chapter-plan") ? project.chapterPlans : []).map((plan) => ({
    id: plan.id,
    number: plan.number,
    title: plan.title,
    volumeId: plan.volumeId,
    targetEmotion: plan.targetEmotion,
    coreEvent: plan.coreEvent,
    status: plan.status,
  })),
  characters: (view.documentKinds.includes("story-character") ? project.characters : []).map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    goals: character.goals,
  })),
  worldEntries: (view.documentKinds.includes("story-world-entry") ? project.worldEntries : []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    keywords: entry.keywords,
  })),
  analyses: (view.documentKinds.includes("story-analysis") ? project.analyses : []).map((analysis) => ({
    id: analysis.id,
    analysisType: analysis.analysisType,
    target: analysis.target,
    status: analysis.status,
    sourceTitle: analysis.source.title,
  })),
  reviews: (view.documentKinds.includes("story-review") ? project.reviews : []).map((review) => ({
    id: review.id,
    reviewType: review.reviewType,
    verdict: review.verdict,
    openFindings: review.findings.filter((finding) => finding.status === "open").length,
  })),
  imports: (view.documentKinds.includes("story-import") ? project.imports : []).map((record) => ({
    id: record.id,
    sourceTitle: record.sourceTitle,
    lengthType: record.lengthType,
    status: record.status,
  })),
  progress: project.progress,
  validation: validateStoryProject(project, contract, "draft"),
});

export const buildChapterContext = (
  project: StoryProject,
  contract: StoryProjectApi,
  view: ResolvedContextView,
  targetId: string,
) => {
  const numericTarget = Number(targetId);
  const plan = project.chapterPlans.find(
    (item) => item.id === targetId || (Number.isFinite(numericTarget) && item.number === numericTarget),
  );
  if (!plan) throw new Error(`找不到章节细纲：${targetId}`);

  const participantIds = new Set([...plan.participantIds, ...plan.beats.flatMap((beat) => beat.participantIds)]);
  const worldRefIds = new Set([...plan.worldRefIds, ...plan.beats.flatMap((beat) => beat.worldRefIds)]);
  const previousPlan = project.chapterPlans.find((item) => item.number === plan.number - 1);
  const chapter = project.chapters.find((item) => item.planId === plan.id);
  const previousChapter = previousPlan
    ? project.chapters.find((candidate) => candidate.planId === previousPlan.id)
    : undefined;
  const relatedForeshadows = project.foreshadows.foreshadows.filter(
    (foreshadow) =>
      foreshadow.plannedPlantChapterId === plan.id ||
      foreshadow.plantedChapterId === plan.id ||
      foreshadow.expectedResolveChapterId === plan.id ||
      foreshadow.resolvedChapterId === plan.id ||
      foreshadow.relatedEntityIds.some((id) => participantIds.has(id) || worldRefIds.has(id)),
  );

  return {
    contextView: { name: view.name },
    revision: project.manifest.revision,
    book: project.book,
    positioning: project.positioning,
    style: project.style,
    volume: view.documentKinds.includes("story-volume")
      ? (project.volumes.find((volume) => volume.id === plan.volumeId) ?? null)
      : null,
    plan,
    chapter: view.documentKinds.includes("story-chapter") ? (chapter ?? null) : null,
    previousChapter:
      view.documentKinds.includes("story-chapter") && previousChapter
        ? {
            id: previousChapter.id,
            title: previousChapter.title,
            summary: previousChapter.summary,
            content: previousChapter.content,
          }
        : null,
    characters: view.documentKinds.includes("story-character")
      ? project.characters.filter((character) => participantIds.has(character.id))
      : [],
    characterStates: view.documentKinds.includes("story-character-state")
      ? project.characterStates.filter((state) => participantIds.has(state.characterId))
      : [],
    worldEntries: view.documentKinds.includes("story-world-entry")
      ? project.worldEntries.filter((entry) => worldRefIds.has(entry.id))
      : [],
    relationships: view.documentKinds.includes("story-relationships")
      ? project.relationships.relationships.filter(
          (relationship) =>
            participantIds.has(relationship.fromCharacterId) && participantIds.has(relationship.toCharacterId),
        )
      : [],
    foreshadows: view.documentKinds.includes("story-foreshadows") ? relatedForeshadows : [],
    progress: project.progress,
    sources: [
      contract.resolveDocument("story-chapter-plan", { id: plan.id }),
      ...(view.documentKinds.includes("story-volume")
        ? [contract.resolveDocument("story-volume", { id: plan.volumeId })]
        : []),
      ...(view.documentKinds.includes("story-character")
        ? [...participantIds].map((id) => contract.resolveDocument("story-character", { id }))
        : []),
      ...(view.documentKinds.includes("story-world-entry")
        ? [...worldRefIds].map((id) => contract.resolveDocument("story-world-entry", { id }))
        : []),
    ],
  };
};
