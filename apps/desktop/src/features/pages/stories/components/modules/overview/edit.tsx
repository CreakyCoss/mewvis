import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Save, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset } from "@/features/story";
import type { StoryDraft } from "../../story-form-utils";
import { EditorField } from "../../story-primitives";

export type StoryOverviewEditHandle = (story?: StoryAsset) => void;

type StoryOverviewEditProps = {
  bind: Ref<StoryOverviewEditHandle>;
  story: StoryAsset;
  onSave: (draft: StoryDraft) => void;
};

const createDraft = (story: StoryAsset): StoryDraft => ({
  title: story.title,
  outline: story.outline,
  goal: story.goal,
  userPersonaName: story.userPersonaName,
});

export const StoryOverviewEdit = ({
  bind,
  story,
  onSave,
}: StoryOverviewEditProps) => {
  const [draft, setDraft] = useState<StoryDraft | null>(null);

  const open = (nextStory = story) => {
    setDraft(createDraft(nextStory));
  };

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const save = () => {
    if (!draft) {
      return;
    }
    onSave(draft);
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="size-4" />
              编辑基础信息
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="space-y-4">
                <EditorField label="标题">
                  <Input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </EditorField>
                <EditorField label="故事定位">
                  <Textarea
                    className="min-h-32 resize-y"
                    value={draft.outline}
                    onChange={(event) => setDraft({ ...draft, outline: event.target.value })}
                  />
                </EditorField>
                <EditorField label="目标">
                  <Textarea
                    className="min-h-24 resize-y"
                    value={draft.goal}
                    onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
                  />
                </EditorField>
              </div>
              <EditorField label="用户称呼">
                <Input
                  value={draft.userPersonaName}
                  onChange={(event) => setDraft({ ...draft, userPersonaName: event.target.value })}
                />
              </EditorField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit" className="gap-2">
                <Save className="size-4" />
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
