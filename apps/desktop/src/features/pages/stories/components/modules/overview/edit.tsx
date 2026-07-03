import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { BookOpen, FileText, Save, ScrollText, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryJson } from "@/features/story";
import type { StoryDraft } from "../../story-form-utils";
import {
  EditorField,
  StoryFormCard,
  StoryFormDialogContent,
  StoryFormFooter,
  StoryFormHeader,
  StoryFormLayout,
  StoryFormNav,
  StoryFormSidebarCard,
  StoryFormSidebarPanel,
  StoryStatusPill,
  emptyValueText,
} from "../../story-primitives";

export type StoryOverviewEditHandle = (story?: StoryJson) => void;

type StoryOverviewEditProps = {
  bind: Ref<StoryOverviewEditHandle>;
  story: StoryJson;
  onSave: (draft: StoryDraft) => void;
};

const createDraft = (story: StoryJson): StoryDraft => ({
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
        <StoryFormDialogContent className="sm:max-w-4xl">
          <StoryFormHeader
            icon={ScrollText}
            title="编辑基础信息"
            description="维护故事整体定位、目标和用户称呼。"
          />
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <StoryFormLayout
              sidebar={(
                <>
                  <StoryFormSidebarCard
                    icon={BookOpen}
                    title={draft.title.trim() || "未命名故事"}
                    meta={(
                      <>
                        <StoryStatusPill tone="active">
                          标准故事
                        </StoryStatusPill>
                        <StoryStatusPill>
                          {story.graph.nodes.length} 节点
                        </StoryStatusPill>
                      </>
                    )}
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.outline.trim() || "还没有填写故事定位。"}
                    </p>
                  </StoryFormSidebarCard>
                  <StoryFormSidebarPanel title="故事目标">
                    <p className="line-clamp-4 text-sm leading-5 text-muted-foreground">
                      {draft.goal.trim() || emptyValueText}
                    </p>
                  </StoryFormSidebarPanel>
                  <StoryFormNav
                    items={[
                      { href: "#story-overview-basic-section", icon: ScrollText, label: "基础信息" },
                      { href: "#story-overview-outline-section", icon: FileText, label: "故事定位" },
                      { href: "#story-overview-goal-section", icon: Target, label: "故事目标" },
                    ]}
                  />
                </>
              )}
            >
              <StoryFormCard
                id="story-overview-basic-section"
                icon={ScrollText}
                title="基础信息"
                description="维护故事名称和用户在故事中的称呼。"
              >
                <div className="grid gap-3 md:grid-cols-2">
                <EditorField label="标题" htmlFor="story-overview-title">
                  <Input
                    id="story-overview-title"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </EditorField>
                <EditorField label="用户称呼" htmlFor="story-overview-user">
                  <Input
                    id="story-overview-user"
                    value={draft.userPersonaName}
                    onChange={(event) => setDraft({ ...draft, userPersonaName: event.target.value })}
                  />
                </EditorField>
                </div>
              </StoryFormCard>
              <StoryFormCard
                id="story-overview-outline-section"
                icon={FileText}
                title="故事定位"
                description="描述故事整体定位、年代风格和核心背景。"
              >
                <EditorField label="故事定位" htmlFor="story-overview-outline">
                  <Textarea
                    id="story-overview-outline"
                    className="min-h-[132px] resize-none text-sm leading-6"
                    value={draft.outline}
                    onChange={(event) => setDraft({ ...draft, outline: event.target.value })}
                  />
                </EditorField>
              </StoryFormCard>
              <StoryFormCard
                id="story-overview-goal-section"
                icon={Target}
                title="故事目标"
                description="故事端只维护标准目标，不混入酒馆运行策略。"
              >
                <EditorField label="目标" htmlFor="story-overview-goal">
                  <Textarea
                    id="story-overview-goal"
                    className="min-h-[96px] resize-none text-sm leading-6"
                    value={draft.goal}
                    onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
                  />
                </EditorField>
              </StoryFormCard>
            </StoryFormLayout>
            <StoryFormFooter status="保存后会更新故事标准数据。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit" className="gap-2">
                <Save className="size-4" />
                保存
              </Button>
            </StoryFormFooter>
          </form>
        </StoryFormDialogContent>
      ) : null}
    </Dialog>
  );
};
