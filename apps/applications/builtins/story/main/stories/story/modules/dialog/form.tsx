import { useEffect, useId, useMemo, useState } from "react";
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
  const inspected = useMemo(
    () => inspectStoryDocument({ ...document, value }),
    [document, value],
  );
  const sections = useMemo(
    () => (inspected ? buildDocumentSections(inspected.fields) : []),
    [inspected],
  );
  const [activeSectionId, setActiveSectionId] = useState("");
  const formId = useId();
  const activeSection =
    sections.find((section) => section.id === activeSectionId) ??
    sections[0] ??
    null;

  useEffect(() => {
    if (
      sections.length > 0 &&
      !sections.some((section) => section.id === activeSectionId)
    ) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  const updateData = (key: string, nextValue: StoryValue) => {
    if (!inspected) return;
    onChange({ ...inspected.data, [key]: nextValue });
  };

  return (
    <div className="sd-form">
      {sections.length > 0 ? (
        <div className="sd-tabs" role="tablist" aria-label="资料内容分组">
          {sections.map((section) => {
            const active = activeSection?.id === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`${formId}-tab-${section.id}`}
                aria-controls={`${formId}-panel-${section.id}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={active ? "active" : ""}
                onClick={() => setActiveSectionId(section.id)}
                onKeyDown={(event) => {
                  const index = sections.findIndex(
                    (item) => item.id === section.id,
                  );
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % sections.length
                      : event.key === "ArrowLeft"
                        ? (index - 1 + sections.length) % sections.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? sections.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setActiveSectionId(sections[next].id);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
              >
                {section.id === "technical" ? "系统信息" : section.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <ScrollArea className="sd-form-scroll">
        <div className="sd-form-content">
          {inspected && activeSection ? (
            <section
              role="tabpanel"
              id={`${formId}-panel-${activeSection.id}`}
              aria-labelledby={`${formId}-tab-${activeSection.id}`}
            >
              <p className="sd-section-description">
                {activeSection.description}
              </p>
              <div className="sd-field-grid">
                {activeSection.fields.map(([pointer, field]) => (
                  <div
                    key={pointer}
                    className={
                      [
                        "textarea",
                        "content",
                        "object",
                        "collection",
                        "string-list",
                        "reference-list",
                      ].includes(field.type)
                        ? "sd-field-wide"
                        : undefined
                    }
                  >
                    <MetadataFieldEditor
                      definitions={inspected.definitions}
                      field={field}
                      value={inspected.data[documentPointerKey(pointer)]}
                      onChange={(nextValue) =>
                        updateData(documentPointerKey(pointer), nextValue)
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div className="sd-fallback-heading">
                <h3>内容</h3>
                <p>当前文档没有字段说明，将按实际 JSON 结构提供编辑控件。</p>
              </div>
              <GenericJsonValueEditor
                value={inspected?.data ?? value}
                onChange={onChange}
              />
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
