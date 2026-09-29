import type { StoryDocument } from "@story/project/types";
import { storyDocumentData } from "../../story-document";

export type ReferenceSection = {
  id: string;
  label: string;
  document?: StoryDocument;
  documents: StoryDocument[];
  nested?: boolean;
};

export type ReferenceLayout = {
  leading: StoryDocument[];
  sections: ReferenceSection[];
};

const section = (
  id: string,
  label: string,
  documents: StoryDocument[],
): ReferenceSection => ({ id, label, documents });

const byNumber = (a: StoryDocument, b: StoryDocument) =>
  Number(storyDocumentData(a)?.number) - Number(storyDocumentData(b)?.number);

export function buildReferenceLayout(
  documents: StoryDocument[],
  panel: string,
): ReferenceLayout {
  if (panel === "outline") {
    const leading = documents.filter((d) => d.ref.kind === "story-book-arc");
    const volumes = documents
      .filter((d) => d.ref.kind === "story-volume")
      .sort(byNumber);
    const plans = documents
      .filter((d) => d.ref.kind === "story-chapter-plan")
      .sort(byNumber);
    const attached = new Set<string>();
    const sections: ReferenceSection[] = volumes.map((volume) => {
      const id = volume.ref.identity.id;
      const children = plans.filter((plan) => {
        if (storyDocumentData(plan)?.volumeId !== id) return false;
        attached.add(plan.ref.identity.id);
        return true;
      });
      return {
        ...section(`volume:${id}`, volume.displayName, children),
        document: volume,
        nested: true,
      };
    });
    const unassigned = plans.filter((plan) => !attached.has(plan.ref.identity.id));
    if (unassigned.length)
      sections.push(section("outline:unassigned", "章节细纲", unassigned));
    const other = documents.filter(
      (d) =>
        !["story-book-arc", "story-volume", "story-chapter-plan"].includes(
          d.ref.kind,
        ),
    );
    if (other.length) sections.push(section("outline:other", "其他大纲", other));
    return { leading, sections };
  }

  if (panel === "work") {
    const analysisKinds = new Set([
      "story-analysis",
      "story-review",
      "story-import",
    ]);
    const core = documents.filter((d) => !analysisKinds.has(d.ref.kind));
    const analysis = documents.filter((d) => analysisKinds.has(d.ref.kind));
    return {
      leading: [],
      sections: [
        ...(core.length ? [section("work:core", "核心资料", core)] : []),
        ...(analysis.length
          ? [section("work:analysis", "分析资料", analysis)]
          : []),
      ],
    };
  }

  if (panel === "people") {
    const relations = documents.filter(
      (d) => d.ref.kind === "story-relationships",
    );
    const people = documents.filter(
      (d) => d.ref.kind !== "story-relationships",
    );
    return {
      leading: [],
      sections: [
        ...(people.length ? [section("people:characters", "人物", people)] : []),
        ...(relations.length
          ? [section("people:relationships", "关系资料", relations)]
          : []),
      ],
    };
  }

  return {
    leading: [],
    sections: documents.length
      ? [
          section(
            `${panel}:main`,
            panel === "world" ? "世界条目" : "连续性资料",
            documents,
          ),
        ]
      : [],
  };
}
