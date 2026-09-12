import { Pencil, Wine } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { TavernRoomConfig } from "@/workbench/pages/stories/tavern/manage/model";
import { EditorSection, editorHeaderActionButtonClassName } from "../../primitives";
import { BasicEdit, type BasicEditHandle } from "./edit";
import { BasicSummaryContent } from "./summary";
import type { ModuleSave } from "../types";

type BasicSectionProps = {
  data: TavernRoomConfig;
  onSave: ModuleSave;
};

export const BasicSection = ({ data, onSave }: BasicSectionProps) => {
  const editRef = useRef<BasicEditHandle>(null);

  return (
    <>
      <EditorSection
        icon={Wine}
        title="运行基础"
        description="管理酒馆呈现名称、默认视觉场景和角色回复模式。"
        action={
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
        }
        contentClassName="p-4"
      >
        <BasicSummaryContent data={data} />
      </EditorSection>

      <BasicEdit bind={editRef} data={data} onSave={onSave} />
    </>
  );
};
