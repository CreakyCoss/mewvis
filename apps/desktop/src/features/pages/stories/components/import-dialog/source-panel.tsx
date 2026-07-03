import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  parseStoryJsonFromText,
  type StoryImportSourceKind,
  type StoryJson,
} from "@/features/story";
import { storyImportSourceLabels } from "../story-form-utils";
import { EditorField, selectClassName } from "../story-primitives";

type StoryImportSourcePanelProps = {
  importRaw: string;
  importSourceKind: StoryImportSourceKind;
  isConverting: boolean;
  onConvert: () => void;
  setImportRaw: (raw: string) => void;
  setImportSourceKind: (kind: StoryImportSourceKind) => void;
  setImportStory: (story: StoryJson | null) => void;
};

export const StoryImportSourcePanel = ({
  importRaw,
  importSourceKind,
  isConverting,
  onConvert,
  setImportRaw,
  setImportSourceKind,
  setImportStory,
}: StoryImportSourcePanelProps) => (
  <div className="min-h-0 space-y-3">
    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <EditorField label="来源类型">
        <select
          className={selectClassName}
          value={importSourceKind}
          onChange={(event) => setImportSourceKind(event.target.value as StoryImportSourceKind)}
        >
          {(["unknown", "json", "plainText", "aiGenerated", "characterCard", "worldBook"] satisfies StoryImportSourceKind[])
            .map((kind) => (
              <option key={kind} value={kind}>{storyImportSourceLabels[kind]}</option>
            ))}
        </select>
      </EditorField>
      <EditorField label="文件">
        <Input
          type="file"
          accept="application/json,text/plain,.json,.txt,.md"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            file.text()
              .then((content) => {
                setImportRaw(content);
                setImportStory(parseStoryJsonFromText(content));
              })
              .catch((error) => {
                console.error("Failed to read story import file", error);
                toast.error("无法读取导入文件。");
              })
              .finally(() => {
                event.target.value = "";
              });
          }}
        />
      </EditorField>
    </div>
    <EditorField label="原始内容">
      <Textarea
        className="min-h-72 resize-y font-mono text-xs"
        value={importRaw}
        onChange={(event) => {
          setImportRaw(event.target.value);
          setImportStory(parseStoryJsonFromText(event.target.value));
        }}
      />
    </EditorField>
    <Button
      type="button"
      className="w-full gap-2"
      onClick={onConvert}
      disabled={isConverting || !importRaw.trim()}
    >
      {isConverting ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
      {isConverting ? "转换中" : "转换为 story.json"}
    </Button>
  </div>
);
