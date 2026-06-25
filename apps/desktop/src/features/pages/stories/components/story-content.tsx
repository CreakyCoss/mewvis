import { BookOpen, FileText, GitBranch, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type {
  StoryAsset,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story";
import { StoryCharactersModule } from "./modules/characters";
import { StoryGraphModule } from "./modules/graph";
import { StoryManuscriptsModule } from "./modules/manuscripts";
import { StoryOverviewModule } from "./modules/overview";
import { StoryScenesModule } from "./modules/scenes";
import { StoryWorldModule } from "./modules/world";
import type { StoryPresentationChannel } from "./presentations/registry";
import {
  storyConfigTabs,
  StoryMetric,
  type StoryConfigTab,
  type StoryDraft,
} from "./shared";

type StoryContentProps = {
  activeTab: StoryConfigTab;
  canCreateStory: boolean;
  isLoading: boolean;
  onAcceptManuscript: (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => void;
  onCreateManuscriptDraft: (
    input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">,
  ) => void;
  onCreateStory: () => void;
  onOpenStoryPresentation: (
    channel: StoryPresentationChannel,
    nodeId?: string,
  ) => void | Promise<void>;
  onPolishManuscriptDraft: (input: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => Promise<string>;
  onRejectManuscript: (draftId: string) => void;
  onSaveManuscriptDraft: (
    draftId: string,
    patch: StoryManuscriptDraftUpdateInput,
  ) => void;
  onSaveOverviewDraft: (draft: StoryDraft) => void;
  onSaveStory: (story: StoryAsset) => void;
  onSetActiveTab: (tab: StoryConfigTab) => void;
  pendingDraftCount: number;
  story: StoryAsset | null;
};

export const StoryContent = ({
  activeTab,
  canCreateStory,
  isLoading,
  onAcceptManuscript,
  onCreateManuscriptDraft,
  onCreateStory,
  onOpenStoryPresentation,
  onPolishManuscriptDraft,
  onRejectManuscript,
  onSaveManuscriptDraft,
  onSaveOverviewDraft,
  onSaveStory,
  onSetActiveTab,
  pendingDraftCount,
  story,
}: StoryContentProps) => (
  <ScrollArea className="min-h-0 flex-1">
    {isLoading ? (
      <div className="p-6 text-sm text-muted-foreground">加载中...</div>
    ) : !story ? (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <BookOpen className="size-10 text-muted-foreground" />
        <div className="text-base font-medium">暂无故事资产</div>
        <Button type="button" className="gap-2" onClick={onCreateStory} disabled={!canCreateStory}>
          <Plus className="size-4" />
          新建故事
        </Button>
      </div>
    ) : (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 lg:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StoryMetric icon={UsersRound} label="角色" value={String(story.characters.length)} />
          <StoryMetric icon={BookOpen} label="世界书" value={String(story.lorebookEntries.length)} />
          <StoryMetric icon={GitBranch} label="节点" value={String(story.graph.nodes.length)} />
          <StoryMetric icon={FileText} label="待收稿" value={String(pendingDraftCount)} />
        </section>

        <div className="flex gap-2 overflow-x-auto rounded-lg border bg-background p-2">
          {storyConfigTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                type="button"
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                className="h-9 shrink-0 gap-2"
                onClick={() => onSetActiveTab(tab.id)}
              >
                <Icon className="size-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {activeTab === "overview" ? (
          <StoryOverviewModule
            story={story}
            onSave={onSaveOverviewDraft}
          />
        ) : null}
        {activeTab === "characters" ? (
          <StoryCharactersModule story={story} onSave={onSaveStory} />
        ) : null}
        {activeTab === "scenes" ? (
          <StoryScenesModule story={story} onSave={onSaveStory} />
        ) : null}
        {activeTab === "world" ? (
          <StoryWorldModule story={story} onSave={onSaveStory} />
        ) : null}
        {activeTab === "graph" ? (
          <StoryGraphModule
            story={story}
            onSave={onSaveStory}
            onOpenNodeTavern={(nodeId) => void onOpenStoryPresentation("tavern", nodeId)}
            onOpenNodeChat={(nodeId) => void onOpenStoryPresentation("chat", nodeId)}
          />
        ) : null}
        {activeTab === "manuscripts" ? (
          <StoryManuscriptsModule
            story={story}
            onAccept={onAcceptManuscript}
            onCreateDraft={onCreateManuscriptDraft}
            onPolishDraft={onPolishManuscriptDraft}
            onSaveDraft={onSaveManuscriptDraft}
            onReject={onRejectManuscript}
          />
        ) : null}

        <Separator />
      </div>
    )}
  </ScrollArea>
);
