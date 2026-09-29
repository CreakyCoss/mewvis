import { useMemo, useState, type ComponentType } from "react";
import {
  BookOpenText,
  ChevronDown,
  FileText,
  Folder,
  PanelRightClose,
  Plus,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type { StoryDocument } from "@story/project/types";
import { storyDocumentData, storyDocumentKey } from "../../story-document";
import { buildDocumentGroups } from "../modules";
import { buildReferenceLayout, type ReferenceSection } from "./reference-panel-model";

const descriptionFields = [
  "description",
  "summary",
  "logline",
  "coreEvent",
  "purpose",
  "premise",
  "tone",
  "emotionalArc",
  "primaryGenre",
  "calendar",
];

function descriptionFor(document: StoryDocument, title: string) {
  const data = storyDocumentData(document);
  for (const field of descriptionFields) {
    const value = data?.[field];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/\s+/g, " ").trim();
    }
  }
  const kind = document.definition?.label;
  return kind === title ? "" : kind ?? "";
}

function ReferenceRow({
  document,
  selectedKey,
  onOpen,
  icon: Icon = FileText,
  titleOverride,
}: {
  document: StoryDocument;
  selectedKey: string | null;
  onOpen: (document: StoryDocument) => void;
  icon?: ComponentType<{ className?: string }>;
  titleOverride?: string;
}) {
  const key = storyDocumentKey(document);
  const active = key === selectedKey;
  const title = titleOverride ?? document.displayName.replace(/（细纲）$/, "");
  const description = descriptionFor(document, title);
  return (
    <button
      className={`sw-reference-item${active ? " active" : ""}`}
      title={document.displayName}
      aria-current={active ? "page" : undefined}
      onClick={() => onOpen(document)}
    >
      <Icon className="sw-reference-icon" />
      <span className="sw-reference-copy">
        <span className="sw-reference-title">{title}</span>
        {description && <span className="sw-reference-kind">{description}</span>}
      </span>
    </button>
  );
}

function ReferenceGroup({
  group,
  collapsed,
  selectedKey,
  onToggle,
  onOpen,
}: {
  group: ReferenceSection;
  collapsed: boolean;
  selectedKey: string | null;
  onToggle: (id: string) => void;
  onOpen: (document: StoryDocument) => void;
}) {
  return (
    <section className="sw-reference-group">
      <h3 className="sw-reference-group-header">
        <button
          aria-label={`${collapsed ? "展开" : "收起"}${group.label}`}
          aria-expanded={!collapsed}
          onClick={() => onToggle(group.id)}
          title={group.label}
        >
          <ChevronDown className={collapsed ? "is-collapsed" : ""} />
          <Folder className="sw-reference-group-icon" />
          <span>{group.label}</span>
        </button>
      </h3>
      {!collapsed && (group.document || group.documents.length > 0) && (
        <div className={`sw-reference-group-items${group.nested ? " is-nested" : ""}`}>
          {group.document && (
            <ReferenceRow
              document={group.document}
              selectedKey={selectedKey}
              onOpen={onOpen}
              titleOverride="分卷概览"
            />
          )}
          {group.documents.map((document) => (
            <ReferenceRow
              key={storyDocumentKey(document)}
              document={document}
              selectedKey={selectedKey}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function StoryReferencePanel({
  documents,
  panel,
  label,
  icon: Icon,
  selectedKey,
  onOpen,
  onCreate,
  onClose,
}: {
  documents: StoryDocument[];
  panel: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  selectedKey: string | null;
  onOpen: (document: StoryDocument) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const visibleDocuments = useMemo(
    () =>
      buildDocumentGroups(documents, "")
        .filter((group) =>
          panel === "outline"
            ? ["outline", "chapter-plan"].includes(group.id)
            : group.id === panel,
        )
        .flatMap((group) => group.documents),
    [documents, panel],
  );
  const layout = useMemo(
    () => buildReferenceLayout(visibleDocuments, panel),
    [visibleDocuments, panel],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = (id: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="sw-assistant-header sw-reference-header">
        <strong>{label}</strong>
        <div>
          <Button
            className="sw-reference-create"
            variant="ghost"
            size="sm"
            onClick={onCreate}
          >
            <Plus className="size-3.5" />
            新增资料
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="收起辅助面板"
            onClick={onClose}
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>
      <nav className="sw-reference-list" aria-label={`${label}资料`}>
        {layout.leading.map((document) => (
          <ReferenceRow
            key={storyDocumentKey(document)}
            document={document}
            selectedKey={selectedKey}
            onOpen={onOpen}
            icon={BookOpenText}
          />
        ))}
        {layout.sections.map((group) => (
          <ReferenceGroup
            key={group.id}
            group={group}
            collapsed={collapsedGroups.has(group.id)}
            selectedKey={selectedKey}
            onToggle={toggleGroup}
            onOpen={onOpen}
          />
        ))}
        {!visibleDocuments.length && (
          <div className="sw-reference-empty">
            <Icon className="size-6" />
            <h3>还没有{label}资料</h3>
            <p>从上方新建一份，逐步丰富你的故事。</p>
          </div>
        )}
      </nav>
    </>
  );
}
