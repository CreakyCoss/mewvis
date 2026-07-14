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
import { StoryProjectDocuments, type JsonValue } from "../../../../../../../core/story-project";
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
  const [path, setPath] = useState("");
  const [content, setContent] = useState("{}\n");

  useEffect(() => {
    if (open) {
      setPath("");
      setContent("{}\n");
    }
  }, [open]);

  const create = async () => {
    try {
      const normalizedPath = StoryProjectDocuments.normalizePath(path);
      const value = JSON.parse(content) as JsonValue;
      if (await createDocument(normalizedPath, value)) {
        onOpenChange(false);
        toast.success("JSON 文件已创建。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法创建 JSON 文件。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增 JSON 文档</DialogTitle>
          <DialogDescription>
            路径必须匹配当前工作区协议；这里只填写普通业务数据，保存时会自动补齐字段定义并校验。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="story-json-path">文件路径</Label>
            <Input
              id="story-json-path"
              value={path}
              placeholder="story/notes/idea.json"
              onChange={(event) => setPath(event.currentTarget.value)}
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
          <Button type="button" disabled={isSaving || !path.trim()} onClick={() => void create()}>
            {isSaving ? "创建中" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
