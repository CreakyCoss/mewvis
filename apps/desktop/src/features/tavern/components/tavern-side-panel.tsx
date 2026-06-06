import type { FormEvent } from "react";
import { Plus, Sparkles, UsersRound } from "lucide-react";
import { agentAvatarOptions, resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernRoom } from "../types";
import { CharacterButton } from "./character-button";

type TavernSidePanelProps = {
  activeRoom: TavernRoom;
  activeCharacter: TavernCharacter | null;
  roomCharacters: TavernCharacter[];
  availableCharacters: TavernCharacter[];
  isAddingCharacter: boolean;
  newCharacterName: string;
  newCharacterDescription: string;
  newCharacterStyle: string;
  newCharacterAvatar: string;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onToggleAddingCharacter: () => void;
  onAddCharacter: (event: FormEvent<HTMLFormElement>) => void;
  onNewCharacterNameChange: (value: string) => void;
  onNewCharacterDescriptionChange: (value: string) => void;
  onNewCharacterStyleChange: (value: string) => void;
  onNewCharacterAvatarChange: (value: string) => void;
  onInviteCharacter: (characterId: string) => void;
};

export const TavernSidePanel = ({
  activeRoom,
  activeCharacter,
  roomCharacters,
  availableCharacters,
  isAddingCharacter,
  newCharacterName,
  newCharacterDescription,
  newCharacterStyle,
  newCharacterAvatar,
  onPatchRoom,
  onToggleAddingCharacter,
  onAddCharacter,
  onNewCharacterNameChange,
  onNewCharacterDescriptionChange,
  onNewCharacterStyleChange,
  onNewCharacterAvatarChange,
  onInviteCharacter,
}: TavernSidePanelProps) => (
  <aside className="hidden min-h-0 flex-col border-l bg-muted/10 xl:flex">
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            场景
          </div>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">房间名称</span>
              <Input
                value={activeRoom.title}
                onChange={(event) => onPatchRoom(activeRoom.id, { title: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">场景描述</span>
              <Textarea
                value={activeRoom.scene}
                className="min-h-[112px] resize-none text-sm leading-6"
                onChange={(event) => onPatchRoom(activeRoom.id, { scene: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">你的称呼</span>
              <Input
                value={activeRoom.userPersonaName}
                onChange={(event) => onPatchRoom(activeRoom.id, { userPersonaName: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound className="size-4 text-primary" />
              角色
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              title="新增角色"
              aria-label="新增角色"
              onClick={onToggleAddingCharacter}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {isAddingCharacter && (
            <form
              className="space-y-3 rounded-md border bg-background/70 p-3"
              onSubmit={onAddCharacter}
            >
              <Input
                value={newCharacterName}
                placeholder="角色名称"
                onChange={(event) => onNewCharacterNameChange(event.target.value)}
              />
              <Textarea
                value={newCharacterDescription}
                placeholder="角色设定"
                className="min-h-[86px] resize-none text-sm leading-6"
                onChange={(event) => onNewCharacterDescriptionChange(event.target.value)}
              />
              <Textarea
                value={newCharacterStyle}
                placeholder="说话方式"
                className="min-h-[72px] resize-none text-sm leading-6"
                onChange={(event) => onNewCharacterStyleChange(event.target.value)}
              />
              <div className="grid grid-cols-6 gap-1.5">
                {agentAvatarOptions.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-md border bg-muted/20 p-1 transition-colors hover:bg-muted/45",
                      newCharacterAvatar === avatar.id && "border-primary bg-primary/10",
                    )}
                    title={avatar.label}
                    aria-label={avatar.label}
                    onClick={() => onNewCharacterAvatarChange(avatar.id)}
                  >
                    <img src={avatar.src} alt="" className="size-full rounded-[5px]" />
                  </button>
                ))}
              </div>
              <Button type="submit" className="h-9 w-full">
                保存角色
              </Button>
            </form>
          )}

          <div className="space-y-2">
            {roomCharacters.map((character) => (
              <CharacterButton
                key={character.id}
                character={character}
                isActive={character.id === activeCharacter?.id}
                onClick={() => onPatchRoom(activeRoom.id, { activeCharacterId: character.id })}
              />
            ))}
            {roomCharacters.length === 0 && (
              <div className="rounded-md border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
                还没有角色入席。
              </div>
            )}
          </div>

          {availableCharacters.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">可邀请</div>
              {availableCharacters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-md border bg-background/55 px-3 py-2 text-left text-sm transition-colors hover:bg-background"
                  onClick={() => onInviteCharacter(character.id)}
                >
                  <img
                    src={resolveAgentAvatar(character.avatar).src}
                    alt=""
                    className="size-8 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{character.name}</span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  </aside>
);
