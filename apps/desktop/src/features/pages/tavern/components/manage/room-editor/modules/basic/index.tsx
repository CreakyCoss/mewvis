import { Pencil, Wine } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/features/pages/tavern/visual-presets";
import { getActiveTavernScene } from "../../../../../storage";
import type { TavernRoom } from "../../../../../types";
import {
  EditorSection,
  InlineSummaryItem,
} from "../../primitives";
import { emptyValueText, formatCount, getReplyModeLabel } from "../../utils";
import { BasicEdit, type BasicEditHandle } from "./edit";
import type { ModuleSave, ModuleEditProps } from "../types";

type BasicSectionProps = {
  data: TavernRoom;
  onSave: ModuleSave;
  renderTextFieldAgentActions: ModuleEditProps["renderTextFieldAgentActions"];
};

export const BasicSection = ({
  data,
  onSave,
  renderTextFieldAgentActions,
}: BasicSectionProps) => {
  const editRef = useRef<BasicEditHandle>(null);
  const activeScene = getActiveTavernScene(data);
  const scenePreset = TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === data.scenePresetId);

  return (
    <>
      <EditorSection
        icon={Wine}
        title="基础信息"
        meta={scenePreset?.label ?? "自定义场景"}
        action={(
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => editRef.current?.(data)}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        )}
        contentClassName="space-y-0 pb-3"
      >
        <div className="rounded-md bg-muted/15 px-3 py-2.5">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="grid min-w-0 gap-1.5">
              <InlineSummaryItem label="大故事" value={data.storyOutline} />
              <InlineSummaryItem label="终局" value={data.storyGoal} />
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5 lg:justify-end">
              <Badge variant="outline">
                阶段：{activeScene?.title || "默认场景"}
              </Badge>
              <Badge variant="outline">
                {formatCount(data.scenes?.length ?? 1, "场景")}
              </Badge>
              <Badge variant="outline">
                {getReplyModeLabel(data.replyMode ?? "active")}
              </Badge>
              <Badge variant="outline">
                称呼：{data.userPersonaName.trim() || emptyValueText}
              </Badge>
            </div>
          </div>
        </div>
      </EditorSection>

      <BasicEdit
        bind={editRef}
        data={data}
        onSave={onSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
      />
    </>
  );
};
