import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { TavernScene } from "../../types";

type SceneSelectorProps = {
  scenes: TavernScene[];
  activeSceneId?: string;
  className?: string;
  onSelectScene: (sceneId: string) => void;
};

export const SceneSelector = ({
  scenes,
  activeSceneId,
  className,
  onSelectScene,
}: SceneSelectorProps) => (
  <div className={cn("relative w-full max-w-[15.5rem] min-w-0", className)}>
    <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 select-none text-[13px] font-semibold leading-none text-current/85">
      场景：
    </span>
    <NativeSelect
      value={activeSceneId ?? scenes[0]?.id ?? ""}
      className={cn(
        "w-full",
        "[&_[data-slot=native-select]]:h-9",
        "[&_[data-slot=native-select]]:rounded-xl",
        "[&_[data-slot=native-select]]:border-current/15",
        "[&_[data-slot=native-select]]:bg-current/5",
        "[&_[data-slot=native-select]]:pl-[3.6rem]",
        "[&_[data-slot=native-select]]:pr-9",
        "[&_[data-slot=native-select]]:text-[13px]",
        "[&_[data-slot=native-select]]:font-medium",
        "[&_[data-slot=native-select]]:leading-none",
        "[&_[data-slot=native-select]]:text-current",
        "[&_[data-slot=native-select]]:shadow-sm",
        "[&_[data-slot=native-select]]:outline-none",
        "[&_[data-slot=native-select]]:hover:border-current/25",
        "[&_[data-slot=native-select]]:hover:bg-current/10",
        "[&_[data-slot=native-select]]:focus-visible:border-current/30",
        "[&_[data-slot=native-select]]:focus-visible:ring-2",
        "[&_[data-slot=native-select]]:focus-visible:ring-current/15",
        "[&_[data-slot=native-select-icon]]:right-3",
        "[&_[data-slot=native-select-icon]]:size-4",
        "[&_[data-slot=native-select-icon]]:text-current",
        "[&_[data-slot=native-select-icon]]:opacity-70",
      )}
      aria-label="选择场景"
      onChange={(event) => onSelectScene(event.target.value)}
    >
      {scenes.length === 0 && (
        <NativeSelectOption value="">默认场景</NativeSelectOption>
      )}
      {scenes.map((scene) => (
        <NativeSelectOption key={scene.id} value={scene.id}>
          {scene.title}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  </div>
);
