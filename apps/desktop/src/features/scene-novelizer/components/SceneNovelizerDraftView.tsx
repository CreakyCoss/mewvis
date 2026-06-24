import { CheckCheck, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SceneNovelDraft } from "../types";
import { SceneNovelizerQualityView } from "./SceneNovelizerQualityView";

export const SceneNovelizerDraftView = ({
  draft,
  onTextChange,
}: {
  draft: SceneNovelDraft;
  onTextChange: (text: string) => void;
}) => {
  const [didCopy, setDidCopy] = useState(false);

  const copyDraft = async () => {
    if (!draft.text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.text);
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1200);
    } catch {
      setDidCopy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-current">章节草稿</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          title={didCopy ? "已复制" : "复制草稿"}
          aria-label={didCopy ? "已复制" : "复制草稿"}
          onClick={() => {
            void copyDraft();
          }}
        >
          {didCopy ? <CheckCheck className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <Textarea
        value={draft.text}
        onChange={(event) => onTextChange(event.target.value)}
        className="min-h-72 resize-y bg-background/70 font-serif text-xs leading-6"
      />
      <SceneNovelizerQualityView quality={draft.quality} />
    </div>
  );
};
