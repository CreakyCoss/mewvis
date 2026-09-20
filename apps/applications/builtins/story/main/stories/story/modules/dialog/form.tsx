import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import type { StoryDocument, StoryValue } from "@story/project/types";
import { inspectStoryDocument } from "../../../story-document";
import { buildDocumentSections, documentPointerKey } from "../structure";
import { GenericJsonValueEditor, MetadataFieldEditor } from "./field-editor";

export const StoryDocumentForm = ({
  document,
  onChange,
  value,
}: {
  document: StoryDocument;
  onChange: (value: StoryValue) => void;
  value: StoryValue;
}) => {
  const inspected = useMemo(() => inspectStoryDocument({ ...document, value }), [document, value]);
  const sections = useMemo(() => (inspected ? buildDocumentSections(inspected.fields) : []), [inspected]);
  const [activeSectionId, setActiveSectionId] = useState("");
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  const updateData = (key: string, nextValue: StoryValue) => {
    if (!inspected) return;
    onChange({ ...inspected.data, [key]: nextValue });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {sections.length > 0 ? (
        <div className="flex shrink-0 items-center gap-6 overflow-x-auto border-b px-6" role="tablist">
          {sections.map((section) => {
            const active = activeSection?.id === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  "relative h-12 shrink-0 rounded-t-lg px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                onClick={() => setActiveSectionId(section.id)}
              >
                {section.label}
                {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-6 py-6">
          {inspected && activeSection ? (
            <section aria-labelledby={`document-form-section-${activeSection.id}`}>
              <div className="mb-2">
                <h3 id={`document-form-section-${activeSection.id}`} className="text-lg font-semibold tracking-tight">
                  {activeSection.label}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeSection.description}</p>
              </div>
              <div className="divide-y">
                {activeSection.fields.map(([pointer, field]) => (
                  <MetadataFieldEditor
                    key={pointer}
                    definitions={inspected.definitions}
                    field={field}
                    value={inspected.data[documentPointerKey(pointer)]}
                    onChange={(nextValue) => updateData(documentPointerKey(pointer), nextValue)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div className="mb-5">
                <h3 className="text-lg font-semibold tracking-tight">内容</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  当前文档没有字段说明，将按实际 JSON 结构提供编辑控件。
                </p>
              </div>
              <GenericJsonValueEditor value={inspected?.data ?? value} onChange={onChange} />
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
