import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookOpen, FileText, GitBranch, House, UsersRound, type LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryJson } from "../model/types";
import type { StoryDraft } from "./utils";
import type { StoryConfigTab } from "./types";
import { useStoryState } from "../use-story-state";
import { StoryCharactersModule } from "./characters";
import { StoryGraphModule } from "./graph";
import { StoryOverviewModule } from "./overview";
import { StoryScenesModule } from "./scenes";
import { StoryWorldModule } from "./world";
import type { StoryLibraryItem } from "../../storage";

type StoryModulesProps = {
  onOpenManuscripts: (item: StoryLibraryItem) => void;
};

export const StoryModules = ({ onOpenManuscripts }: StoryModulesProps) => {
  const story = useStoryState((state) => state.story);
  const storyWorkspace = useStoryState((state) => state.storyWorkspace);
  const saveStory = useStoryState((state) => state.saveStory);
  const [activeTab, setActiveTab] = useState<StoryConfigTab>("overview");
  const storyId = story?.id ?? "";

  const saveOverviewDraft = (draft: StoryDraft) => {
    if (!story) {
      return;
    }

    void saveStory({
      ...story,
      title: draft.title.trim() || story.title,
      premise: draft.premise,
      goal: draft.goal,
      playerName: draft.playerName.trim() || "我",
    });
  };

  useEffect(() => {
    if (!storyId) {
      return;
    }

    setActiveTab("overview");
  }, [storyId]);

  type StoryModuleConfig = {
    description: string;
    icon: LucideIcon;
    id: StoryConfigTab;
    label: string;
    render: (targetStory: StoryJson) => ReactNode;
  };

  const storyConfigTabs: StoryModuleConfig[] = [
    {
      id: "overview",
      label: "总览",
      description: "核心故事资源概览",
      icon: House,
      render: (targetStory) => (
        <StoryOverviewModule
          story={targetStory}
          onOpenManuscripts={
            storyWorkspace
              ? () =>
                  onOpenManuscripts({
                    id: targetStory.id,
                    story: targetStory,
                    workspace: storyWorkspace,
                  })
              : undefined
          }
          onOpenModule={setActiveTab}
          onSave={saveOverviewDraft}
        />
      ),
    },
    {
      id: "characters",
      label: "角色",
      description: "角色人设与记忆",
      icon: UsersRound,
      render: (targetStory) => (
        <StoryCharactersModule story={targetStory} onSave={(nextStory) => void saveStory(nextStory)} />
      ),
    },
    {
      id: "scenes",
      label: "场景",
      description: "场景内容和推进",
      icon: BookOpen,
      render: (targetStory) => (
        <StoryScenesModule story={targetStory} onSave={(nextStory) => void saveStory(nextStory)} />
      ),
    },
    {
      id: "graph",
      label: "剧情结构",
      description: "节点和分支",
      icon: GitBranch,
      render: (targetStory) => (
        <StoryGraphModule
          story={targetStory}
          onSave={(nextStory) => void saveStory(nextStory)}
          onOpenScenes={() => setActiveTab("scenes")}
        />
      ),
    },
    {
      id: "world",
      label: "世界书",
      description: "共享设定资料",
      icon: FileText,
      render: (targetStory) => (
        <StoryWorldModule story={targetStory} onSave={(nextStory) => void saveStory(nextStory)} />
      ),
    },
  ];
  const activeModule = storyConfigTabs.find((item) => item.id === activeTab) ?? storyConfigTabs[0];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-20 shrink-0 flex-col border-r bg-muted/10 px-2 py-4">
        <nav className="flex min-h-0 flex-1 flex-col gap-1">
          {storyConfigTabs.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={`${label}：${description}`}
              aria-label={`切换到${label}`}
              onClick={() => setActiveTab(id)}
              className={[
                "flex flex-col items-center gap-1 rounded-md px-1.5 py-2 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                activeTab === id ? "bg-primary/10 text-primary" : "",
              ].join(" ")}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <ScrollArea className="min-h-0 flex-1 bg-muted/10">
        <div className="flex w-full flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="mx-auto w-full max-w-7xl">{story ? activeModule.render(story) : null}</div>
        </div>
      </ScrollArea>
    </div>
  );
};
