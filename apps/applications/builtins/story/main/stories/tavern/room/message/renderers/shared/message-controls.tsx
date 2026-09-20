import { writeClipboardText } from "@isle/app-sdk/browser";
import { useState } from "react";
import { CheckCheck, Copy } from "lucide-react";
import { Button } from "design-system/components/ui/button";

type MessageControlsProps = {
  content: string;
  disabled?: boolean;
};
export const MessageControls = ({ content, disabled }: MessageControlsProps) => {
  const [didCopy, setDidCopy] = useState(false);
  const canCopy = Boolean(content.trim()) && !disabled;

  if (!content.trim()) {
    return null;
  }

  const copyContent = async () => {
    if (!canCopy) {
      return;
    }

    try {
      await writeClipboardText(content);
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1200);
    } catch {
      setDidCopy(false);
    }
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity motion-reduce:transition-none group-hover/message:opacity-100 focus-within:opacity-100">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-current opacity-65 hover:bg-current/10 hover:text-current hover:opacity-100"
        title={didCopy ? "已复制" : "复制"}
        aria-label={didCopy ? "已复制" : "复制"}
        disabled={!canCopy}
        onClick={() => {
          void copyContent();
        }}
      >
        {didCopy ? <CheckCheck className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
};
