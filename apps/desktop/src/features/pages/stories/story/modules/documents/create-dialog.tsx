import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StoryDocumentIdentity, StoryValue } from "../../../../../../../core/story-project/types";
import { useStoryState } from "../../use-story-state";

export const CreateJsonDocumentDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const createDocument = useStoryState((state) => state.createDocument);
  const isSaving = useStoryState((state) => state.isSaving);
  const [kind, setKind] = useState("");
  const [identity, setIdentity] = useState('{\n  "id": ""\n}\n');
  const [content, setContent] = useState("{}\n");

  useEffect(() => {
    if (open) {
      setKind("");
      setIdentity('{\n  "id": ""\n}\n');
      setContent("{}\n");
    }
  }, [open]);

  const create = async () => {
    try {
      const value = JSON.parse(content) as StoryValue;
      const parsedIdentity = JSON.parse(identity) as StoryDocumentIdentity["identity"];
      if (await createDocument({ kind: kind.trim(), identity: parsedIdentity }, value)) {
        onOpenChange(false);
        toast.success("结构化文档已创建。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法创建结构化文档。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增结构化文档</DialogTitle>
          <DialogDescription>填写文档 kind 和领域身份；保存时会按当前故事类型补齐并校验字段。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="story-document-kind">文档 kind</Label>
            <Input
              id="story-document-kind"
              value={kind}
              placeholder="story-character"
              onChange={(event) => setKind(event.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="story-document-identity">领域身份</Label>
            <Textarea
              id="story-document-identity"
              value={identity}
              className="min-h-24 font-mono text-xs"
              onChange={(event) => setIdentity(event.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="story-json-content">初始业务数据</Label>
            <Textarea
              id="story-json-content"
              value={content}
              className="min-h-56 font-mono text-xs"
              onChange={(event) => setContent(event.currentTarget.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={isSaving || !kind.trim()} onClick={() => void create()}>
            {isSaving ? "创建中" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
