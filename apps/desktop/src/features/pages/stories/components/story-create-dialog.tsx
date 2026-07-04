import type { FormEvent, Ref } from "react";
import { useCallback, useImperativeHandle, useState } from "react";
import { open as openDirectoryDialog } from "@tauri-apps/plugin-dialog";
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
import type { StoryJson } from "../story/model/types";
import { createStory as createStoryInWorkspace, type CreateStoryInput } from "../storage";

export type StoryCreateDialogHandle = () => void;

type StoryCreateForm = {
  name: string;
  workspacePath: string;
};

type StoryCreateDialogProps = {
  bind: Ref<StoryCreateDialogHandle>;
  onCreated: (story: StoryJson) => void;
};

const emptyForm = (): StoryCreateForm => ({
  name: "",
  workspacePath: "",
});

export const StoryCreateDialog = ({ bind, onCreated }: StoryCreateDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<StoryCreateForm>(emptyForm);

  const open = useCallback(() => {
    setForm(emptyForm());
    setIsOpen(true);
  }, []);

  useImperativeHandle(bind, () => open, [open]);

  const chooseDirectory = async () => {
    const selected = await openDirectoryDialog({
      directory: true,
      multiple: false,
      title: "选择故事工作区",
    });

    if (typeof selected === "string") {
      setForm((current) => ({ ...current, workspacePath: selected }));
    }
  };

  const createStory = async (input: CreateStoryInput) => {
    setIsSaving(true);
    try {
      const { story } = await createStoryInWorkspace(input);
      toast.success("故事已创建。");
      setIsOpen(false);
      onCreated(story);
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
      <DialogContent className="border-transparent shadow-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">新建故事</DialogTitle>
          <DialogDescription>
            创建后，故事源内容会写入所选工作区的 story/ 目录，酒馆运行时会写入 .tavern/。
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
            <Label htmlFor="story-create-workspace">故事工作区</Label>
            <div className="flex gap-2">
              <Input
                id="story-create-workspace"
                value={form.workspacePath}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({ ...current, workspacePath: value }));
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
