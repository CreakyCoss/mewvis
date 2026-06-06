import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  Copy,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserMinus,
  UsersRound,
} from "lucide-react";
import { agentAvatarOptions, resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { stringifyTavernCharacterCard } from "../character-card";
import type {
  TavernCharacter,
  TavernReplyMode,
  TavernRoom,
} from "../types";
import { CharacterButton } from "./character-button";

type TavernSidePanelProps = {
  activeRoom: TavernRoom;
  activeCharacter: TavernCharacter | null;
  roomCharacters: TavernCharacter[];
  availableCharacters: TavernCharacter[];
  isAddingCharacter: boolean;
  isSending: boolean;
  canDeleteRoom: boolean;
  newCharacterName: string;
  newCharacterDescription: string;
  newCharacterStyle: string;
  newCharacterGoals: string;
  newCharacterRelationships: string;
  newCharacterAvatar: string;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onToggleAddingCharacter: () => void;
  onAddCharacter: (event: FormEvent<HTMLFormElement>) => void;
  onNewCharacterNameChange: (value: string) => void;
  onNewCharacterDescriptionChange: (value: string) => void;
  onNewCharacterStyleChange: (value: string) => void;
  onNewCharacterGoalsChange: (value: string) => void;
  onNewCharacterRelationshipsChange: (value: string) => void;
  onNewCharacterAvatarChange: (value: string) => void;
  onInviteCharacter: (characterId: string) => void;
  onUpdateCharacter: (characterId: string, patch: Partial<TavernCharacter>) => void;
  onImportCharacterCard: (raw: string) => string | null;
  onRemoveCharacterFromRoom: (characterId: string) => void;
  onClearRoomMessages: () => void;
  onClearAutoMemory: () => void;
  onDeleteRoom: () => void;
};

const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
  icon: typeof MessageSquare;
}> = [
  { value: "active", label: "当前角色", icon: MessageSquare },
  { value: "round", label: "全员轮流", icon: UsersRound },
];

export const TavernSidePanel = ({
  activeRoom,
  activeCharacter,
  roomCharacters,
  availableCharacters,
  isAddingCharacter,
  isSending,
  canDeleteRoom,
  newCharacterName,
  newCharacterDescription,
  newCharacterStyle,
  newCharacterGoals,
  newCharacterRelationships,
  newCharacterAvatar,
  onPatchRoom,
  onToggleAddingCharacter,
  onAddCharacter,
  onNewCharacterNameChange,
  onNewCharacterDescriptionChange,
  onNewCharacterStyleChange,
  onNewCharacterGoalsChange,
  onNewCharacterRelationshipsChange,
  onNewCharacterAvatarChange,
  onInviteCharacter,
  onUpdateCharacter,
  onImportCharacterCard,
  onRemoveCharacterFromRoom,
  onClearRoomMessages,
  onClearAutoMemory,
  onDeleteRoom,
}: TavernSidePanelProps) => {
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStyle, setEditStyle] = useState("");
  const [editGoals, setEditGoals] = useState("");
  const [editRelationships, setEditRelationships] = useState("");
  const [editAvatar, setEditAvatar] = useState(agentAvatarOptions[0]?.id ?? "");
  const [isImportingCharacter, setIsImportingCharacter] = useState(false);
  const [characterCardText, setCharacterCardText] = useState("");
  const [characterCardStatus, setCharacterCardStatus] = useState("");

  useEffect(() => {
    setEditName(activeCharacter?.name ?? "");
    setEditDescription(activeCharacter?.description ?? "");
    setEditStyle(activeCharacter?.speakingStyle ?? "");
    setEditGoals(activeCharacter?.goals ?? "");
    setEditRelationships(activeCharacter?.relationships ?? "");
    setEditAvatar(activeCharacter?.avatar ?? agentAvatarOptions[0]?.id ?? "");
  }, [activeCharacter]);

  const handleSaveCharacter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCharacter) {
      return;
    }

    const name = editName.trim();
    const description = editDescription.trim();
    const speakingStyle = editStyle.trim();
    if (!name || !description || !speakingStyle) {
      return;
    }

    onUpdateCharacter(activeCharacter.id, {
      name,
      avatar: editAvatar,
      description,
      speakingStyle,
      goals: editGoals.trim() || undefined,
      relationships: editRelationships.trim() || undefined,
    });
  };

  const copyCharacterCard = async () => {
    if (!activeCharacter) {
      return;
    }

    try {
      await navigator.clipboard.writeText(stringifyTavernCharacterCard(activeCharacter));
      setCharacterCardStatus("已复制");
    } catch {
      setCharacterCardStatus("复制失败");
    }
  };

  const importCharacterCard = () => {
    const raw = characterCardText.trim();
    if (!raw) {
      setCharacterCardStatus("请粘贴角色卡");
      return;
    }

    const error = onImportCharacterCard(raw);
    if (error) {
      setCharacterCardStatus(error);
      return;
    }

    setCharacterCardText("");
    setIsImportingCharacter(false);
    setCharacterCardStatus("已导入");
  };

  return (
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
                  disabled={isSending}
                  onChange={(event) => onPatchRoom(activeRoom.id, { title: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">场景描述</span>
                <Textarea
                  value={activeRoom.scene}
                  disabled={isSending}
                  className="min-h-[112px] resize-none text-sm leading-6"
                  onChange={(event) => onPatchRoom(activeRoom.id, { scene: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">房间记忆</span>
                <Textarea
                  value={activeRoom.memory}
                  disabled={isSending}
                  className="min-h-[96px] resize-none text-sm leading-6"
                  onChange={(event) => onPatchRoom(activeRoom.id, { memory: event.target.value })}
                />
              </label>
              {activeRoom.autoMemory.trim() && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">自动记忆</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={isSending}
                      onClick={onClearAutoMemory}
                    >
                      清除
                    </Button>
                  </div>
                  <Textarea
                    value={activeRoom.autoMemory}
                    readOnly
                    className="min-h-[112px] resize-none bg-muted/20 text-sm leading-6"
                  />
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">你的称呼</span>
                <Input
                  value={activeRoom.userPersonaName}
                  disabled={isSending}
                  onChange={(event) => onPatchRoom(activeRoom.id, { userPersonaName: event.target.value })}
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">发言模式</span>
                <div className="grid grid-cols-2 gap-1 rounded-md border bg-background/60 p-1">
                  {replyModeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = (activeRoom.replyMode ?? "active") === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "flex h-8 items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium text-muted-foreground transition-colors",
                          "hover:bg-muted hover:text-foreground",
                          isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                        )}
                        disabled={isSending}
                        onClick={() => onPatchRoom(activeRoom.id, { replyMode: option.value })}
                      >
                        <Icon className="size-3.5" />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
                disabled={isSending}
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
                  disabled={isSending}
                  onChange={(event) => onNewCharacterNameChange(event.target.value)}
                />
                <Textarea
                  value={newCharacterDescription}
                  placeholder="角色设定"
                  disabled={isSending}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => onNewCharacterDescriptionChange(event.target.value)}
                />
                <Textarea
                  value={newCharacterStyle}
                  placeholder="说话方式"
                  disabled={isSending}
                  className="min-h-[72px] resize-none text-sm leading-6"
                  onChange={(event) => onNewCharacterStyleChange(event.target.value)}
                />
                <Textarea
                  value={newCharacterGoals}
                  placeholder="目标"
                  disabled={isSending}
                  className="min-h-[64px] resize-none text-sm leading-6"
                  onChange={(event) => onNewCharacterGoalsChange(event.target.value)}
                />
                <Textarea
                  value={newCharacterRelationships}
                  placeholder="关系"
                  disabled={isSending}
                  className="min-h-[64px] resize-none text-sm leading-6"
                  onChange={(event) => onNewCharacterRelationshipsChange(event.target.value)}
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
                      disabled={isSending}
                      onClick={() => onNewCharacterAvatarChange(avatar.id)}
                    >
                      <img src={avatar.src} alt="" className="size-full rounded-[5px]" />
                    </button>
                  ))}
                </div>
                <Button type="submit" className="h-9 w-full" disabled={isSending}>
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
                disabled={isSending}
                onClick={() => onPatchRoom(activeRoom.id, { activeCharacterId: character.id })}
              />
              ))}
              {roomCharacters.length === 0 && (
                <div className="rounded-md border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
                  还没有角色入席。
                </div>
              )}
            </div>

            {activeCharacter && (
              <form
                className="space-y-3 rounded-md border bg-background/70 p-3"
                onSubmit={handleSaveCharacter}
              >
                <div className="text-xs font-medium text-muted-foreground">角色档案</div>
                <Input
                  value={editName}
                  disabled={isSending}
                  onChange={(event) => setEditName(event.target.value)}
                />
                <Textarea
                  value={editDescription}
                  disabled={isSending}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => setEditDescription(event.target.value)}
                />
                <Textarea
                  value={editStyle}
                  disabled={isSending}
                  className="min-h-[72px] resize-none text-sm leading-6"
                  onChange={(event) => setEditStyle(event.target.value)}
                />
                <Textarea
                  value={editGoals}
                  placeholder="目标"
                  disabled={isSending}
                  className="min-h-[64px] resize-none text-sm leading-6"
                  onChange={(event) => setEditGoals(event.target.value)}
                />
                <Textarea
                  value={editRelationships}
                  placeholder="关系"
                  disabled={isSending}
                  className="min-h-[64px] resize-none text-sm leading-6"
                  onChange={(event) => setEditRelationships(event.target.value)}
                />
                <div className="grid grid-cols-6 gap-1.5">
                  {agentAvatarOptions.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-md border bg-muted/20 p-1 transition-colors hover:bg-muted/45",
                        editAvatar === avatar.id && "border-primary bg-primary/10",
                      )}
                      title={avatar.label}
                      aria-label={avatar.label}
                      disabled={isSending}
                      onClick={() => setEditAvatar(avatar.id)}
                    >
                      <img src={avatar.src} alt="" className="size-full rounded-[5px]" />
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button type="submit" size="sm" disabled={isSending}>
                    <Save className="size-4" />
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSending}
                    onClick={() => void copyCharacterCard()}
                  >
                    <Copy className="size-4" />
                    复制
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSending || roomCharacters.length <= 1}
                    onClick={() => onRemoveCharacterFromRoom(activeCharacter.id)}
                  >
                    <UserMinus className="size-4" />
                    移出
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-2 rounded-md border bg-background/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">角色卡</div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={isSending}
                  onClick={() => {
                    setIsImportingCharacter((current) => !current);
                    setCharacterCardStatus("");
                  }}
                >
                  导入
                </Button>
              </div>
              {isImportingCharacter && (
                <div className="space-y-2">
                  <Textarea
                    value={characterCardText}
                    placeholder="JSON"
                    className="min-h-[120px] resize-none font-mono text-xs leading-5"
                    disabled={isSending}
                    onChange={(event) => setCharacterCardText(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    disabled={isSending}
                    onClick={importCharacterCard}
                  >
                    <Save className="size-4" />
                    保存角色卡
                  </Button>
                </div>
              )}
              {characterCardStatus && (
                <div className="text-xs text-muted-foreground">{characterCardStatus}</div>
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
                    disabled={isSending}
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

          <section className="space-y-3">
            <div className="text-sm font-semibold">房间操作</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSending}
                onClick={onClearRoomMessages}
              >
                <RotateCcw className="size-4" />
                清空
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={isSending || !canDeleteRoom}
                onClick={onDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
};
