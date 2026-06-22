import { Pencil, Wine } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { getTavernPresentationProfile } from "../../../../../prompt-registry/presentation-rules";
import { getTavernPromptStylePreset } from "../../../../../prompt-styles";
import type { TavernMessage, TavernRoom } from "../../../../../types";
import {
  EditorSection,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { BasicEdit, type BasicEditHandle } from "./edit";
import { BasicSummaryContent } from "./summary";
import type { ModuleSave, ModuleEditProps } from "../types";

type BasicSectionProps = {
  data: TavernRoom;
  messages: TavernMessage[];
  onSave: ModuleSave;
  renderTextFieldAgentActions: ModuleEditProps["renderTextFieldAgentActions"];
};

export const BasicSection = ({
  data,
  messages,
  onSave,
  renderTextFieldAgentActions,
}: BasicSectionProps) => {
  const editRef = useRef<BasicEditHandle>(null);
  const promptStyle = getTavernPromptStylePreset(data.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(data.presentation?.profileId);

  return (
    <>
      <EditorSection
        icon={Wine}
        title="基础信息"
        meta={`${presentationProfile.label} / ${promptStyle.label}`}
        metaClassName="border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.(data)}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        )}
        contentClassName="p-4"
      >
        <BasicSummaryContent data={data} />
      </EditorSection>

      <BasicEdit
        bind={editRef}
        data={data}
        messages={messages}
        onSave={onSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
      />
    </>
  );
};
