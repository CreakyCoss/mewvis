import type { FormEvent, Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { openSystemDialog as openDirectoryDialog } from "@/api/native";
import { FolderOpen } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { storyProjectApi } from "../project-client";
import { createStory as createStoryInWorkspace, type CreateStoryInput, type StoryLibraryItem } from "../storage";

export type StoryCreateDialogHandle = () => void;

type StoryCreateForm = {
  name: string;
  storyTypeId: string;
  workspaceParentPath: string;
};

type StoryCreateDialogProps = {
  bind: Ref<StoryCreateDialogHandle>;
  onCreated: (item: StoryLibraryItem) => void;
};

const storyTypes = storyProjectApi.listStoryTypes();

const emptyForm = (): StoryCreateForm => ({
  name: "",
  storyTypeId: storyTypes[0]?.id ?? "",
  workspaceParentPath: "",
});

export const StoryCreateDialog = ({ bind, onCreated }: StoryCreateDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<StoryCreateForm>(emptyForm);

  const open = () => {
    setForm(emptyForm());
    setIsOpen(true);
  };

  useImperativeHandle(bind, () => open);

  const chooseDirectory = async () => {
    const selected = await openDirectoryDialog({
      directory: true,
      multiple: false,
      title: "选择故事父目录",
    });

    if (typeof selected === "string") {
      setForm((current) => ({ ...current, workspaceParentPath: selected }));
    }
  };

  const createStory = async (input: CreateStoryInput) => {
    setIsSaving(true);
    try {
      const { documents, overview, workspace } = await createStoryInWorkspace(input);
      toast.success("故事已创建。");
      setIsOpen(false);
      onCreated({
        id: workspace.id,
        documents,
        overview,
        workspace,
      });
    } catch (error) {
      console.error("Failed to create story", error);
      toast.error(error instanceof Error ? error.message : "故事创建失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void createStory(form);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSaving && setIsOpen(open)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">新建故事</DialogTitle>
          <DialogDescription>
            创建独立的空故事工作区；之后可以手动新增 JSON，或由创作助手初始化结构化故事文件。
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="story-create-name">故事名</Label>
            <Input
              id="story-create-name"
              value={form.name}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, name: value }));
              }}
              placeholder="例如：雨巷尽头"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="story-create-workspace">故事父目录</Label>
            <div className="flex gap-2">
              <Input
                id="story-create-workspace"
                value={form.workspaceParentPath}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({ ...current, workspaceParentPath: value }));
                }}
                placeholder="请选择目录"
                required
              />
              <Button type="button" variant="outline" onClick={chooseDirectory} title="选择目录" disabled={isSaving}>
                <FolderOpen className="size-4" />
                <span>选择</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="story-create-type">故事类型</Label>
            <Select
              value={form.storyTypeId}
              onValueChange={(storyTypeId) => setForm((current) => ({ ...current, storyTypeId }))}
              disabled={isSaving}
              required
            >
              <SelectTrigger id="story-create-type" className="w-full">
                <SelectValue placeholder="选择故事类型" />
              </SelectTrigger>
              <SelectContent>
                {storyTypes.map((storyType) => (
                  <SelectItem key={storyType.id} value={storyType.id}>
                    {storyType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {storyTypes.find((storyType) => storyType.id === form.storyTypeId)?.description}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "正在创建" : "创建故事"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
