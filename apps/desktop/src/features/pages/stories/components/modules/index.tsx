import type { Ref } from "react";
import { useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryJson } from "@/features/story/model/story-types";
import { storyConfigTabs } from "../story-tabs";
import { StoryTavernSelectDialog } from "../story-tavern-select-dialog";
import { StoryCharactersModule } from "./characters";
import { StoryGraphModule } from "./graph";
import { StoryManuscriptsModule } from "./manuscripts";
import { StoryOverviewModule } from "./overview";
import { StoryScenesModule } from "./scenes";
import { useStoryState } from "./use-story-state";
import { StoryWorldModule } from "./world";

export type StoryModulesHandle = (story: StoryJson) => void;

type StoryModulesProps = {
  bind: Ref<StoryModulesHandle>;
};

export const StoryModules = ({ bind }: StoryModulesProps) => {
  const {
    activeTab,
    manuscriptActions,
    open,
    openStoryPresentation,
    saveOverviewDraft,
    saveStory,
    setActiveTab,
    setTavernSelectNodeId,
    story,
    storyWorkspace,
    tavernSelectNodeId,
    tavernWorkspace,
  } = useStoryState();

  useImperativeHandle(bind, () => (nextStory) => open(nextStory), [open]);

  const renderActiveModule = () => {
    if (!story) {
      return null;
    }

    if (activeTab === "overview") {
      return <StoryOverviewModule story={story} onOpenModule={setActiveTab} onSave={saveOverviewDraft} />;
    }
    if (activeTab === "characters") {
      return <StoryCharactersModule story={story} onSave={(nextStory) => void saveStory(nextStory)} />;
    }
    if (activeTab === "scenes") {
      return <StoryScenesModule story={story} onSave={(nextStory) => void saveStory(nextStory)} />;
    }
    if (activeTab === "world") {
      return <StoryWorldModule story={story} onSave={(nextStory) => void saveStory(nextStory)} />;
    }
    if (activeTab === "graph") {
      return (
        <StoryGraphModule
          story={story}
          onSave={(nextStory) => void saveStory(nextStory)}
          onOpenScenes={() => setActiveTab("scenes")}
          onOpenNodeTavern={(nodeId) => void openStoryPresentation("tavern", nodeId)}
          onOpenNodeChat={(nodeId) => void openStoryPresentation("chat", nodeId)}
        />
      );
    }
    if (activeTab === "manuscripts") {
      return (
        <StoryManuscriptsModule
          story={story}
          onAccept={manuscriptActions.acceptManuscript}
          onCreateDraft={manuscriptActions.createManuscriptDraft}
          onPolishDraft={manuscriptActions.polishManuscriptDraft}
          onSaveDraft={manuscriptActions.saveManuscriptDraft}
          onReject={manuscriptActions.rejectManuscript}
        />
      );
    }

    return null;
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        <div className="flex h-full min-h-0 overflow-hidden">
          <aside className="hidden w-20 shrink-0 flex-col border-r bg-muted/10 px-2 py-4 md:flex">
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
              <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                {storyConfigTabs.map(({ id, label, description, icon: Icon }) => (
                  <Button
                    key={id}
                    type="button"
                    title={`${label}：${description}`}
                    aria-label={`切换到${label}`}
                    size="sm"
                    variant={activeTab === id ? "default" : "outline"}
                    className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </Button>
                ))}
              </nav>

              <div className="mx-auto w-full max-w-7xl">{renderActiveModule()}</div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <StoryTavernSelectDialog
        open={tavernSelectNodeId !== undefined}
        activeStory={story}
        nodeId={tavernSelectNodeId ?? undefined}
        storyWorkspace={storyWorkspace}
        tavernWorkspace={tavernWorkspace}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTavernSelectNodeId(undefined);
          }
        }}
      />
    </>
  );
};
