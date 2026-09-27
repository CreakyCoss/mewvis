import { useMemo, type ComponentType } from "react";
import { ChevronRight, PanelRightClose, Plus } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type { StoryDocument } from "@story/project/types";
import { storyDocumentKey } from "../../story-document";
import { buildDocumentGroups } from "../modules";

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
  const groups = useMemo(
    () =>
      buildDocumentGroups(documents, "").filter((group) =>
        panel === "outline"
          ? ["outline", "chapter-plan"].includes(group.id)
          : group.id === panel,
      ),
    [documents, panel],
  );
  const count = groups.reduce((sum, group) => sum + group.documents.length, 0);
  return (
    <>
      <div className="sw-assistant-header">
        <strong>{label}</strong>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="收起辅助面板"
          onClick={onClose}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>
      <div className="sw-reference-toolbar">
        <span>{count} 份资料</span>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="size-3.5" />
          新增资料
        </Button>
      </div>
      <nav className="sw-reference-list" aria-label={`${label}资料`}>
        {groups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <section className="sw-reference-group" key={group.id}>
              {groups.length > 1 && (
                <h3>
                  {group.id === "outline" ? "全书与分卷" : group.label}
                  <span>{group.documents.length}</span>
                </h3>
              )}
              {group.documents.map((document) => {
                const key = storyDocumentKey(document);
                const active = key === selectedKey;
                const title = document.displayName.replace(/（细纲）$/, "");
                const kind = document.definition?.label ?? group.label;
                return (
                  <button
                    className={`sw-reference-item ${active ? "active" : ""}`}
                    key={key}
                    title={document.displayName}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onOpen(document)}
                  >
                    <span className="sw-reference-icon">
                      <GroupIcon className="size-4" />
                    </span>
                    <span className="sw-reference-copy">
                      <span className="sw-reference-title">{title}</span>
                      {kind !== title && (
                        <span className="sw-reference-kind">{kind}</span>
                      )}
                    </span>
                    <ChevronRight className="sw-reference-arrow size-3.5" />
                  </button>
                );
              })}
            </section>
          );
        })}
        {!count && (
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
