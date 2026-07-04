import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseStoryJsonFromText } from "@/features/story/importing/story-import-converter";
import type { StoryJson } from "@/features/story/model/story-types";
import { EditorField } from "../story-primitives";

type StoryImportSourcePanelProps = {
  importRaw: string;
  isConverting: boolean;
  onConvert: () => void;
  setImportRaw: (raw: string) => void;
  setImportStory: (story: StoryJson | null) => void;
};

export const StoryImportSourcePanel = ({
  importRaw,
  isConverting,
  onConvert,
  setImportRaw,
  setImportStory,
}: StoryImportSourcePanelProps) => (
  <div className="min-h-0 space-y-3">
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
