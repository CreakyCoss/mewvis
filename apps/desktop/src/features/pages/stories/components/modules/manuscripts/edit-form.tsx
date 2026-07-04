import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryJson } from "@/features/story/model/story-types";
import { EditorField, selectClassName } from "../../story-primitives";
import type {
  ManuscriptEditDraft,
  ManuscriptEditMode,
} from "./edit-types";

type StoryManuscriptEditFormProps = {
  draft: ManuscriptEditDraft;
  mode: ManuscriptEditMode;
  onChange: (draft: ManuscriptEditDraft) => void;
  story: StoryJson;
};

export const StoryManuscriptEditForm = ({
  draft,
  mode,
  onChange,
  story,
}: StoryManuscriptEditFormProps) => (
  <>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-4">
        <EditorField label="标题">
          <Input
            value={draft.title}
            onChange={(event) => onChange({
              ...draft,
              title: event.target.value,
            })}
          />
        </EditorField>
        <EditorField label="摘要">
          <Textarea
            className="min-h-24 resize-y"
            value={draft.summary}
            onChange={(event) => onChange({
              ...draft,
              summary: event.target.value,
            })}
          />
        </EditorField>
      </div>
      <div className="space-y-4">
        {mode === "create" ? (
          <EditorField label="节点">
            <select
              className={selectClassName}
              value={draft.nodeId}
              onChange={(event) => onChange({
                ...draft,
                nodeId: event.target.value,
              })}
            >
              {story.graph.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </select>
          </EditorField>
        ) : null}
        <EditorField label="分支 ID">
          <Input
            value={draft.branchId ?? ""}
            onChange={(event) => onChange({
              ...draft,
              branchId: event.target.value,
            })}
            placeholder="可选"
          />
        </EditorField>
      </div>
    </div>
    <EditorField label="正文">
      <Textarea
        className="min-h-[18rem] resize-y font-mono text-sm leading-6"
        value={draft.content}
        onChange={(event) => onChange({
          ...draft,
          content: event.target.value,
        })}
      />
    </EditorField>
  </>
);
