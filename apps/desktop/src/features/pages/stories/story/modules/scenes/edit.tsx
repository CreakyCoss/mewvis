import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { BookOpenText, Clapperboard, FileText, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryJson, StorySceneJson, StorySceneStatusJson } from "@/features/story/model/story-types";
import { createStoryScene } from "../../../components/story-form-utils";
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
} from "../../../components/story-primitives";
import type { StoryModuleSave } from "../types";

export type StoryScenesEditHandle = (scene?: StorySceneJson | null) => void;

type StoryScenesEditProps = {
  bind: Ref<StoryScenesEditHandle>;
  story: StoryJson;
  onSave: StoryModuleSave;
};

type SceneDraft = {
  id: string | null;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  status: StorySceneStatusJson;
};

const createStatus = (status: StorySceneStatusJson | undefined): StorySceneStatusJson => ({
  location: status?.location ?? "",
  timeLabel: status?.timeLabel ?? "",
  weather: status?.weather ?? "",
  atmosphere: status?.atmosphere ?? "",
  scenePhase: status?.scenePhase ?? "",
  immediateThreat: status?.immediateThreat ?? "",
});

const createDraft = (scene: StorySceneJson | null, index: number): SceneDraft => {
  const created = scene ?? createStoryScene(index);

  return {
    id: scene?.id ?? null,
    title: created.title,
    scene: created.scene,
    goal: created.goal,
    plot: created.plot,
    direction: created.direction,
    transition: created.transition,
    memory: created.memory,
    status: createStatus(created.status),
  };
};

export const StoryScenesEdit = ({ bind, story, onSave }: StoryScenesEditProps) => {
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [error, setError] = useState("");

  const open = (scene: StorySceneJson | null = null) => {
    setDraft(createDraft(scene, story.scenes.length));
    setError("");
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const title = draft.title.trim();
    if (!title) {
      setError("请填写场景标题。");
      return;
    }

    const now = Date.now();
    const nextScene: StorySceneJson = {
      id: draft.id ?? `story-scene-${crypto.randomUUID()}`,
      title,
      scene: draft.scene.trim(),
      goal: draft.goal.trim(),
      plot: draft.plot.trim(),
      direction: draft.direction.trim(),
      transition: draft.transition.trim(),
      memory: draft.memory.trim(),
      status: {
        location: draft.status.location?.trim() || undefined,
        timeLabel: draft.status.timeLabel?.trim() || undefined,
        weather: draft.status.weather?.trim() || undefined,
        atmosphere: draft.status.atmosphere?.trim() || undefined,
        scenePhase: draft.status.scenePhase?.trim() || undefined,
        immediateThreat: draft.status.immediateThreat?.trim() || undefined,
      },
    };

    onSave({
      ...story,
      scenes: draft.id
        ? story.scenes.map((scene) => (scene.id === draft.id ? nextScene : scene))
        : [...story.scenes, nextScene],
      updatedAt: now,
    });
    close();
  };

  const updateStatus = (field: keyof StorySceneStatusJson, value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            status: {
              ...current.status,
              [field]: value,
            },
          }
        : current,
    );
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
        <StoryFormDialogContent className="sm:max-w-6xl">
          <StoryFormHeader
            icon={Clapperboard}
            title={draft.id ? "编辑场景" : "新增场景"}
            description="修改故事场景的描述、剧情进展、目标、走向、记忆和当前状态。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <StoryFormLayout
              sidebar={
                <>
                  <StoryFormSidebarCard
                    icon={Clapperboard}
                    title={draft.title.trim() || "未命名场景"}
                    meta={
                      <>
                        <StoryStatusPill tone={draft.id ? "active" : "info"}>
                          {draft.id ? "当前场景" : "新增"}
                        </StoryStatusPill>
                        <StoryStatusPill>{story.scenes.length} 场景</StoryStatusPill>
                      </>
                    }
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.scene.trim() || "还没有填写场景描述。"}
                    </p>
                  </StoryFormSidebarCard>
                  <StoryFormSidebarPanel title="场景目标">
                    <p className="line-clamp-4 text-sm leading-5 text-muted-foreground">
                      {draft.goal.trim() || emptyValueText}
                    </p>
                  </StoryFormSidebarPanel>
                  <StoryFormNav
                    items={[
                      { href: "#story-scenes-basic-section", icon: Clapperboard, label: "基础信息" },
                      { href: "#story-scenes-content-section", icon: FileText, label: "场景内容" },
                      { href: "#story-scenes-memory-section", icon: BookOpenText, label: "场景记忆" },
                      { href: "#story-scenes-status-section", icon: MapPin, label: "状态信息" },
                    ]}
                  />
                </>
              }
            >
              {error ? (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <StoryFormCard
                id="story-scenes-basic-section"
                icon={Clapperboard}
                title="基础信息"
                description="场景标题用于故事标准数据和剧情节点绑定。"
              >
                <EditorField label="场景标题" htmlFor="story-scenes-title">
                  <Input
                    id="story-scenes-title"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        title: event.target.value,
                      })
                    }
                  />
                </EditorField>
              </StoryFormCard>

              <StoryFormCard
                id="story-scenes-content-section"
                icon={FileText}
                title="场景内容"
                description="定义场景描述、剧情进展、阶段目标和承接关系。"
              >
                <div className="space-y-3">
                  <EditorField label="场景描述" htmlFor="story-scenes-scene">
                    <Textarea
                      id="story-scenes-scene"
                      className="min-h-[132px] resize-none text-sm leading-6"
                      value={draft.scene}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          scene: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="剧情进展" htmlFor="story-scenes-plot">
                    <Textarea
                      id="story-scenes-plot"
                      className="min-h-[132px] resize-none text-sm leading-6"
                      value={draft.plot}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          plot: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="场景目标" htmlFor="story-scenes-goal">
                    <Textarea
                      id="story-scenes-goal"
                      className="min-h-[92px] resize-none text-sm leading-6"
                      value={draft.goal}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          goal: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="推进方向" htmlFor="story-scenes-direction">
                    <Textarea
                      id="story-scenes-direction"
                      className="min-h-[112px] resize-none text-sm leading-6"
                      value={draft.direction}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          direction: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="承接关系" htmlFor="story-scenes-transition">
                    <Textarea
                      id="story-scenes-transition"
                      className="min-h-[92px] resize-none text-sm leading-6"
                      value={draft.transition}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          transition: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                </div>
              </StoryFormCard>

              <StoryFormCard
                id="story-scenes-memory-section"
                icon={BookOpenText}
                title="场景记忆"
                description="保存本阶段长期可被承接的事实和状态。"
              >
                <EditorField label="场景记忆" htmlFor="story-scenes-memory">
                  <Textarea
                    id="story-scenes-memory"
                    className="min-h-[112px] resize-none text-sm leading-6"
                    value={draft.memory}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        memory: event.target.value,
                      })
                    }
                  />
                </EditorField>
              </StoryFormCard>

              <StoryFormCard
                id="story-scenes-status-section"
                icon={MapPin}
                title="状态信息"
                description="地点、时间和氛围会进入故事端标准上下文。"
              >
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <EditorField label="地点" htmlFor="story-scenes-status-location">
                    <Input
                      id="story-scenes-status-location"
                      value={draft.status.location ?? ""}
                      onChange={(event) => updateStatus("location", event.target.value)}
                    />
                  </EditorField>
                  <EditorField label="时间" htmlFor="story-scenes-status-time">
                    <Input
                      id="story-scenes-status-time"
                      value={draft.status.timeLabel ?? ""}
                      onChange={(event) => updateStatus("timeLabel", event.target.value)}
                    />
                  </EditorField>
                  <EditorField label="天气" htmlFor="story-scenes-status-weather">
                    <Input
                      id="story-scenes-status-weather"
                      value={draft.status.weather ?? ""}
                      onChange={(event) => updateStatus("weather", event.target.value)}
                    />
                  </EditorField>
                  <EditorField label="氛围" htmlFor="story-scenes-status-atmosphere">
                    <Input
                      id="story-scenes-status-atmosphere"
                      value={draft.status.atmosphere ?? ""}
                      onChange={(event) => updateStatus("atmosphere", event.target.value)}
                    />
                  </EditorField>
                  <EditorField label="阶段" htmlFor="story-scenes-status-phase">
                    <Input
                      id="story-scenes-status-phase"
                      value={draft.status.scenePhase ?? ""}
                      onChange={(event) => updateStatus("scenePhase", event.target.value)}
                    />
                  </EditorField>
                  <EditorField label="即时威胁" htmlFor="story-scenes-status-threat">
                    <Input
                      id="story-scenes-status-threat"
                      value={draft.status.immediateThreat ?? ""}
                      onChange={(event) => updateStatus("immediateThreat", event.target.value)}
                    />
                  </EditorField>
                </div>
              </StoryFormCard>
            </StoryFormLayout>

            <StoryFormFooter status="保存后会立即更新故事场景标准数据。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存场景
              </Button>
            </StoryFormFooter>
          </form>
        </StoryFormDialogContent>
      ) : null}
    </Dialog>
  );
};
