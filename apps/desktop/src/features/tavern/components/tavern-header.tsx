import { Wine } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import type { TavernCharacter, TavernRoom } from "../types";
import { compactScene } from "../utils";

type TavernHeaderProps = {
  activeRoom: TavernRoom;
  activeCharacter: TavernCharacter | null;
  modelName?: string | null;
};

export const TavernHeader = ({
  activeRoom,
  activeCharacter,
  modelName,
}: TavernHeaderProps) => (
  <header className="flex min-h-[73px] flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
        <Wine className="size-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold leading-6">
          {activeRoom.title}
        </h2>
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {compactScene(activeRoom.scene)}
        </p>
      </div>
    </div>
    {activeCharacter && (
      <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
        <img
          src={resolveAgentAvatar(activeCharacter.avatar).src}
          alt=""
          className="size-8 shrink-0 rounded-md"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {activeCharacter.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {modelName ?? "未选择模型"}
          </div>
        </div>
      </div>
    )}
  </header>
);
