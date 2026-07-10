import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { CharacterStatusSection } from "./characters/section";

export const SidePanel = ({ isOpen }: { isOpen: boolean }) => {
  const story = useTavernRoomContext((store) => store.story);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);

  if (!isOpen || !story) {
    return null;
  }

  return (
    <aside className={cn("hidden min-h-0 flex-col border-l lg:flex", visualPreset.tavern.sidePanel)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <CharacterStatusSection />
        </div>
      </ScrollArea>
    </aside>
  );
};
