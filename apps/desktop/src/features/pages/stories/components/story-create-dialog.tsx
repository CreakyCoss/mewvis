import type { FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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

export type StoryCreateForm = {
  name: string;
  workspacePath: string;
};

type StoryCreateDialogProps = {
  open: boolean;
  form: StoryCreateForm;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (updater: (current: StoryCreateForm) => StoryCreateForm) => void;
  onSubmit: () => Promise<unknown> | unknown;
};

export const StoryCreateDialog = ({
  open: isOpen,
  form,
  isSaving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: StoryCreateDialogProps) => {
  const chooseDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择故事工作区",
    });

    if (typeof selected === "string") {
      onFormChange((current) => ({ ...current, workspacePath: selected }));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
                onFormChange((current) => ({ ...current, name: value }));
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
                  onFormChange((current) => ({ ...current, workspacePath: value }));
                }}
                placeholder="请选择目录"
                required
              />
              <Button type="button" variant="outline" onClick={chooseDirectory} title="选择目录">
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
