import type { FormEvent } from "react";
import { useRef } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Loader2,
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
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { stringifyTavernCharacterCard } from "../character-card";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernLorebookEntry,
  TavernReplyMode,
  TavernRoom,
  TavernTimelineEvent,
} from "../types";
import { CharacterButton } from "./character-button";

type TavernSidePanelProps = {
  activeRoom: TavernRoom;
  activeCharacter: TavernCharacter | null;
  roomCharacters: TavernCharacter[];
  availableCharacters: TavernCharacter[];
  providers: LlmProvider[];
  globalProvider: LlmProvider | null;
  globalModel: ProviderModel | null;
  isAddingCharacter: boolean;
  isSending: boolean;
  isExtractingAssets: boolean;
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
  onUpdateCharacterMemory: (characterId: string, memory: string) => void;
  onImportCharacterCard: (raw: string) => string | null;
  onAddTimelineEvent: (input: {
    title: string;
    summary: string;
  }) => void;
  onUpdateTimelineEvent: (eventId: string, patch: Partial<TavernTimelineEvent>) => void;
  onDeleteTimelineEvent: (eventId: string) => void;
  onAddLorebookEntry: (input: {
    title: string;
    content: string;
    keywords: string[];
    alwaysOn: boolean;
  }) => void;
  onUpdateLorebookEntry: (entryId: string, patch: Partial<TavernLorebookEntry>) => void;
  onDeleteLorebookEntry: (entryId: string) => void;
  onUpdateAssetDraft: (
    draftId: string,
    patch: Partial<Pick<
      TavernAssetDraft,
      "timelineEvents" | "characterMemories" | "lorebookEntries"
    >>,
  ) => void;
  onApplyAssetDraft: (draftId: string) => void;
  onDeleteAssetDraft: (draftId: string) => void;
  onExtractRecentAssets: () => void;
  onExportRoom: () => void;
  onImportRoom: (raw: string) => string | null;
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
  { value: "director", label: "导演调度", icon: Sparkles },
];

const MODEL_MODE_INHERIT = "inherit";
const MODEL_MODE_CUSTOM = "custom";

export const TavernSidePanel = ({
  activeRoom,
  activeCharacter,
  roomCharacters,
  availableCharacters,
  providers,
  globalProvider,
  globalModel,
  isAddingCharacter,
  isSending,
  isExtractingAssets,
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
  onUpdateCharacterMemory,
  onImportCharacterCard,
  onAddTimelineEvent,
  onUpdateTimelineEvent,
  onDeleteTimelineEvent,
  onAddLorebookEntry,
  onUpdateLorebookEntry,
  onDeleteLorebookEntry,
  onUpdateAssetDraft,
  onApplyAssetDraft,
  onDeleteAssetDraft,
  onExtractRecentAssets,
  onExportRoom,
  onImportRoom,
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
  const [editModelMode, setEditModelMode] = useState<typeof MODEL_MODE_INHERIT | typeof MODEL_MODE_CUSTOM>(
    MODEL_MODE_INHERIT,
  );
  const [editProviderId, setEditProviderId] = useState("");
  const [editModelId, setEditModelId] = useState("");
  const [isImportingCharacter, setIsImportingCharacter] = useState(false);
  const [characterCardText, setCharacterCardText] = useState("");
  const [characterCardStatus, setCharacterCardStatus] = useState("");
  const [isAddingLoreEntry, setIsAddingLoreEntry] = useState(false);
  const [isAddingTimelineEvent, setIsAddingTimelineEvent] = useState(false);
  const [timelineTitle, setTimelineTitle] = useState("");
  const [timelineSummary, setTimelineSummary] = useState("");
  const [loreTitle, setLoreTitle] = useState("");
  const [loreKeywords, setLoreKeywords] = useState("");
  const [loreContent, setLoreContent] = useState("");
  const [loreAlwaysOn, setLoreAlwaysOn] = useState(false);
  const [roomImportStatus, setRoomImportStatus] = useState("");
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);
  const modelProviders = useMemo(
    () => providers.filter((provider) => provider.models.some((model) => model.isEnabled)),
    [providers],
  );
  const selectedEditProvider = useMemo(
    () => modelProviders.find((provider) => provider.id === editProviderId)
      ?? modelProviders[0]
      ?? null,
    [editProviderId, modelProviders],
  );
  const selectedEditModels = useMemo(
    () => selectedEditProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedEditProvider],
  );
  const globalModelLabel = globalProvider && globalModel
    ? `${globalProvider.name} / ${globalModel.modelName}`
    : "未选择";
  const activeCharacterMemory = activeCharacter
    ? activeRoom.characterMemories[activeCharacter.id] ?? ""
    : "";

  useEffect(() => {
    const configuredProvider = activeCharacter?.modelConfig?.providerId
      ? modelProviders.find((provider) => provider.id === activeCharacter.modelConfig?.providerId)
      : null;
    const nextProvider = configuredProvider
      ?? (globalProvider ? modelProviders.find((provider) => provider.id === globalProvider.id) : null)
      ?? modelProviders[0]
      ?? null;
    const configuredModel = nextProvider && activeCharacter?.modelConfig?.modelId
      ? nextProvider.models.find((model) =>
          model.id === activeCharacter.modelConfig?.modelId && model.isEnabled
        )
      : null;

    setEditName(activeCharacter?.name ?? "");
    setEditDescription(activeCharacter?.description ?? "");
    setEditStyle(activeCharacter?.speakingStyle ?? "");
    setEditGoals(activeCharacter?.goals ?? "");
    setEditRelationships(activeCharacter?.relationships ?? "");
    setEditAvatar(activeCharacter?.avatar ?? agentAvatarOptions[0]?.id ?? "");
    setEditModelMode(activeCharacter?.modelConfig ? MODEL_MODE_CUSTOM : MODEL_MODE_INHERIT);
    setEditProviderId(nextProvider?.id ?? "");
    setEditModelId(configuredModel?.id ?? nextProvider?.models.find((model) => model.isEnabled)?.id ?? "");
  }, [activeCharacter, globalProvider, modelProviders]);

  const handleEditProviderChange = (providerId: string) => {
    const nextProvider = modelProviders.find((provider) => provider.id === providerId) ?? null;

    setEditProviderId(nextProvider?.id ?? "");
    setEditModelId(nextProvider?.models.find((model) => model.isEnabled)?.id ?? "");
  };

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
      modelConfig: editModelMode === MODEL_MODE_CUSTOM && editProviderId && editModelId
        ? {
            providerId: editProviderId,
            modelId: editModelId,
          }
        : undefined,
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

  const parseLoreKeywords = (value: string) =>
    value.split(/[,，\n]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

  const handleAddLoreEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = loreTitle.trim();
    const content = loreContent.trim();
    if (!title || !content) {
      return;
    }

    onAddLorebookEntry({
      title,
      content,
      keywords: parseLoreKeywords(loreKeywords),
      alwaysOn: loreAlwaysOn,
    });
    setLoreTitle("");
    setLoreKeywords("");
    setLoreContent("");
    setLoreAlwaysOn(false);
    setIsAddingLoreEntry(false);
  };

  const handleAddTimelineEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = timelineTitle.trim();
    const summary = timelineSummary.trim();
    if (!title || !summary) {
      return;
    }

    onAddTimelineEvent({ title, summary });
    setTimelineTitle("");
    setTimelineSummary("");
    setIsAddingTimelineEvent(false);
  };

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = onImportRoom(await file.text());
      setRoomImportStatus(error ?? "房间已导入");
    } catch {
      setRoomImportStatus("读取房间文件失败");
    }
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
                <span className="text-xs font-medium text-muted-foreground">场景目标</span>
                <Textarea
                  value={activeRoom.sceneGoal}
                  disabled={isSending}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => onPatchRoom(activeRoom.id, { sceneGoal: event.target.value })}
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
              {activeCharacter && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {activeCharacter.name} 的记忆
                  </span>
                  <Textarea
                    value={activeCharacterMemory}
                    disabled={isSending}
                    className="min-h-[96px] resize-none text-sm leading-6"
                    onChange={(event) => onUpdateCharacterMemory(activeCharacter.id, event.target.value)}
                  />
                </label>
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
                <div className="grid grid-cols-3 gap-1 rounded-md border bg-background/60 p-1">
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
              <div className="space-y-2 rounded-md border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">运行设置</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={activeRoom.settings.showExecutionTrace}
                    disabled={isSending || isExtractingAssets}
                    onChange={(event) => onPatchRoom(activeRoom.id, {
                      settings: {
                        ...activeRoom.settings,
                        showExecutionTrace: event.target.checked,
                      },
                    })}
                  />
                  显示执行过程
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={activeRoom.settings.autoAssetExtractionEnabled}
                    disabled={isSending || isExtractingAssets}
                    onChange={(event) => onPatchRoom(activeRoom.id, {
                      settings: {
                        ...activeRoom.settings,
                        autoAssetExtractionEnabled: event.target.checked,
                      },
                    })}
                  />
                  自动整理剧情资产
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">间隔</span>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={activeRoom.settings.assetExtractionIntervalTurns}
                      disabled={isSending || isExtractingAssets}
                      className="h-8 text-xs"
                      onChange={(event) => onPatchRoom(activeRoom.id, {
                        settings: {
                          ...activeRoom.settings,
                          assetExtractionIntervalTurns: Math.min(
                            10,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        },
                      })}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">草稿</span>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={activeRoom.settings.maxAssetDrafts}
                      disabled={isSending || isExtractingAssets}
                      className="h-8 text-xs"
                      onChange={(event) => onPatchRoom(activeRoom.id, {
                        settings: {
                          ...activeRoom.settings,
                          maxAssetDrafts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                        },
                      })}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">导演</span>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={activeRoom.settings.directorMaxSpeakers}
                      disabled={isSending || isExtractingAssets}
                      className="h-8 text-xs"
                      onChange={(event) => onPatchRoom(activeRoom.id, {
                        settings: {
                          ...activeRoom.settings,
                          directorMaxSpeakers: Math.min(6, Math.max(1, Number(event.target.value) || 1)),
                        },
                      })}
                    />
                  </label>
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
                <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                  <div className="text-xs font-medium text-muted-foreground">模型</div>
                  <NativeSelect
                    size="sm"
                    className="w-full"
                    value={editModelMode}
                    disabled={isSending}
                    onChange={(event) => setEditModelMode(
                      event.target.value === MODEL_MODE_CUSTOM
                        ? MODEL_MODE_CUSTOM
                        : MODEL_MODE_INHERIT,
                    )}
                  >
                    <NativeSelectOption value={MODEL_MODE_INHERIT}>
                      跟随默认：{globalModelLabel}
                    </NativeSelectOption>
                    <NativeSelectOption value={MODEL_MODE_CUSTOM} disabled={modelProviders.length === 0}>
                      角色专属模型
                    </NativeSelectOption>
                  </NativeSelect>
                  {editModelMode === MODEL_MODE_CUSTOM && (
                    <div className="grid gap-2">
                      <NativeSelect
                        size="sm"
                        className="w-full"
                        value={editProviderId}
                        disabled={isSending || modelProviders.length === 0}
                        onChange={(event) => handleEditProviderChange(event.target.value)}
                      >
                        {modelProviders.map((provider) => (
                          <NativeSelectOption key={provider.id} value={provider.id}>
                            {provider.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        size="sm"
                        className="w-full"
                        value={editModelId}
                        disabled={isSending || selectedEditModels.length === 0}
                        onChange={(event) => setEditModelId(event.target.value)}
                      >
                        {selectedEditModels.map((model) => (
                          <NativeSelectOption key={model.id} value={model.id}>
                            {model.modelName}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  )}
                </div>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" />
                剧情资产草稿
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isSending || isExtractingAssets}
                onClick={onExtractRecentAssets}
              >
                {isExtractingAssets ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                整理最近
              </Button>
            </div>
            {activeRoom.assetDrafts.length > 0 && (
              <div className="space-y-2">
                {activeRoom.assetDrafts.map((draft: TavernAssetDraft, index) => {
                  const draftSummary = [
                    draft.timelineEvents.length > 0 ? `${draft.timelineEvents.length} 时间线` : "",
                    draft.characterMemories.length > 0 ? `${draft.characterMemories.length} 记忆` : "",
                    draft.lorebookEntries.length > 0 ? `${draft.lorebookEntries.length} 世界书` : "",
                  ].filter(Boolean).join(" / ");

                  return (
                    <div key={draft.id} className="space-y-3 rounded-md border bg-background/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold">草稿 {index + 1}</div>
                          {draftSummary && (
                            <div className="mt-0.5 text-xs text-muted-foreground">{draftSummary}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="xs"
                            disabled={isSending || isExtractingAssets}
                            onClick={() => onApplyAssetDraft(draft.id)}
                          >
                            <Save className="size-3.5" />
                            应用
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            title="忽略草稿"
                            aria-label="忽略草稿"
                            disabled={isSending || isExtractingAssets}
                            onClick={() => onDeleteAssetDraft(draft.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {draft.timelineEvents.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">时间线</div>
                          {draft.timelineEvents.map((event) => (
                            <div key={event.id} className="space-y-1.5 rounded-md bg-muted/35 px-2.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={event.title}
                                  disabled={isSending || isExtractingAssets}
                                  className="h-8 flex-1 bg-background/70 text-xs"
                                  onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                    timelineEvents: draft.timelineEvents.map((item) =>
                                      item.id === event.id
                                        ? { ...item, title: changeEvent.target.value }
                                        : item
                                    ),
                                  })}
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  title="删除时间线草稿"
                                  aria-label="删除时间线草稿"
                                  disabled={isSending || isExtractingAssets}
                                  onClick={() => onUpdateAssetDraft(draft.id, {
                                    timelineEvents: draft.timelineEvents.filter((item) => item.id !== event.id),
                                  })}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                              <Textarea
                                value={event.summary}
                                disabled={isSending || isExtractingAssets}
                                className="min-h-[72px] resize-none bg-background/70 text-xs leading-5"
                                onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                  timelineEvents: draft.timelineEvents.map((item) =>
                                    item.id === event.id
                                      ? { ...item, summary: changeEvent.target.value }
                                      : item
                                  ),
                                })}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {draft.characterMemories.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">角色记忆</div>
                          {draft.characterMemories.map((memory) => (
                            <div key={memory.id} className="space-y-1.5 rounded-md bg-muted/35 px-2.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <NativeSelect
                                  size="sm"
                                  value={memory.characterId}
                                  disabled={isSending || isExtractingAssets}
                                  className="h-8 flex-1 bg-background/70 text-xs"
                                  onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                    characterMemories: draft.characterMemories.map((item) =>
                                      item.id === memory.id
                                        ? { ...item, characterId: changeEvent.target.value }
                                        : item
                                    ),
                                  })}
                                >
                                  {roomCharacters.map((character) => (
                                    <NativeSelectOption key={character.id} value={character.id}>
                                      {character.name}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelect>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  title="删除记忆草稿"
                                  aria-label="删除记忆草稿"
                                  disabled={isSending || isExtractingAssets}
                                  onClick={() => onUpdateAssetDraft(draft.id, {
                                    characterMemories: draft.characterMemories.filter((item) => item.id !== memory.id),
                                  })}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                              <Textarea
                                value={memory.note}
                                disabled={isSending || isExtractingAssets}
                                className="min-h-[72px] resize-none bg-background/70 text-xs leading-5"
                                onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                  characterMemories: draft.characterMemories.map((item) =>
                                    item.id === memory.id
                                      ? { ...item, note: changeEvent.target.value }
                                      : item
                                  ),
                                })}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {draft.lorebookEntries.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">世界书</div>
                          {draft.lorebookEntries.map((entry) => (
                            <div key={entry.id} className="space-y-1.5 rounded-md bg-muted/35 px-2.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={entry.title}
                                  disabled={isSending || isExtractingAssets}
                                  className="h-8 flex-1 bg-background/70 text-xs"
                                  onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                    lorebookEntries: draft.lorebookEntries.map((item) =>
                                      item.id === entry.id
                                        ? { ...item, title: changeEvent.target.value }
                                        : item
                                    ),
                                  })}
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  title="删除世界书草稿"
                                  aria-label="删除世界书草稿"
                                  disabled={isSending || isExtractingAssets}
                                  onClick={() => onUpdateAssetDraft(draft.id, {
                                    lorebookEntries: draft.lorebookEntries.filter((item) => item.id !== entry.id),
                                  })}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                              <Input
                                value={entry.keywords.join("，")}
                                placeholder="关键词"
                                disabled={isSending || isExtractingAssets}
                                className="h-8 bg-background/70 text-xs"
                                onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                  lorebookEntries: draft.lorebookEntries.map((item) =>
                                    item.id === entry.id
                                      ? { ...item, keywords: parseLoreKeywords(changeEvent.target.value) }
                                      : item
                                  ),
                                })}
                              />
                              <Textarea
                                value={entry.content}
                                disabled={isSending || isExtractingAssets}
                                className="min-h-[86px] resize-none bg-background/70 text-xs leading-5"
                                onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                  lorebookEntries: draft.lorebookEntries.map((item) =>
                                    item.id === entry.id
                                      ? { ...item, content: changeEvent.target.value }
                                      : item
                                  ),
                                })}
                              />
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={entry.alwaysOn}
                                  disabled={isSending || isExtractingAssets}
                                  onChange={(changeEvent) => onUpdateAssetDraft(draft.id, {
                                    lorebookEntries: draft.lorebookEntries.map((item) =>
                                      item.id === entry.id
                                        ? { ...item, alwaysOn: changeEvent.target.checked }
                                        : item
                                    ),
                                  })}
                                />
                                常驻
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">剧情时间线</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                title="新增剧情事件"
                aria-label="新增剧情事件"
                disabled={isSending}
                onClick={() => setIsAddingTimelineEvent((current) => !current)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {isAddingTimelineEvent && (
              <form
                className="space-y-2 rounded-md border bg-background/70 p-3"
                onSubmit={handleAddTimelineEvent}
              >
                <Input
                  value={timelineTitle}
                  placeholder="事件标题"
                  disabled={isSending}
                  onChange={(event) => setTimelineTitle(event.target.value)}
                />
                <Textarea
                  value={timelineSummary}
                  placeholder="事件摘要"
                  disabled={isSending}
                  className="min-h-[84px] resize-none text-sm leading-6"
                  onChange={(event) => setTimelineSummary(event.target.value)}
                />
                <Button type="submit" size="sm" className="w-full" disabled={isSending}>
                  <Save className="size-4" />
                  保存事件
                </Button>
              </form>
            )}

            <div className="space-y-2">
              {activeRoom.timelineEvents.map((event, index) => (
                <div key={event.id} className="space-y-2 rounded-md border bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Input
                      value={event.title}
                      disabled={isSending}
                      className="h-8 flex-1"
                      onChange={(changeEvent) => onUpdateTimelineEvent(event.id, {
                        title: changeEvent.target.value,
                      })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="删除剧情事件"
                      aria-label="删除剧情事件"
                      disabled={isSending}
                      onClick={() => onDeleteTimelineEvent(event.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={event.summary}
                    disabled={isSending}
                    className="min-h-[76px] resize-none text-sm leading-6"
                    onChange={(changeEvent) => onUpdateTimelineEvent(event.id, {
                      summary: changeEvent.target.value,
                    })}
                  />
                </div>
              ))}
              {activeRoom.timelineEvents.length === 0 && (
                <div className="rounded-md border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
                  暂无剧情事件。
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">世界书</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                title="新增世界书"
                aria-label="新增世界书"
                disabled={isSending}
                onClick={() => setIsAddingLoreEntry((current) => !current)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {isAddingLoreEntry && (
              <form
                className="space-y-2 rounded-md border bg-background/70 p-3"
                onSubmit={handleAddLoreEntry}
              >
                <Input
                  value={loreTitle}
                  placeholder="条目名称"
                  disabled={isSending}
                  onChange={(event) => setLoreTitle(event.target.value)}
                />
                <Input
                  value={loreKeywords}
                  placeholder="关键词"
                  disabled={isSending}
                  onChange={(event) => setLoreKeywords(event.target.value)}
                />
                <Textarea
                  value={loreContent}
                  placeholder="设定内容"
                  disabled={isSending}
                  className="min-h-[92px] resize-none text-sm leading-6"
                  onChange={(event) => setLoreContent(event.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={loreAlwaysOn}
                    disabled={isSending}
                    onChange={(event) => setLoreAlwaysOn(event.target.checked)}
                  />
                  常驻
                </label>
                <Button type="submit" size="sm" className="w-full" disabled={isSending}>
                  <Save className="size-4" />
                  保存条目
                </Button>
              </form>
            )}

            <div className="space-y-2">
              {activeRoom.lorebookEntries.map((entry) => (
                <div key={entry.id} className="space-y-2 rounded-md border bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={entry.title}
                      disabled={isSending}
                      className="h-8 flex-1"
                      onChange={(event) => onUpdateLorebookEntry(entry.id, { title: event.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="删除世界书"
                      aria-label="删除世界书"
                      disabled={isSending}
                      onClick={() => onDeleteLorebookEntry(entry.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Input
                    value={entry.keywords.join("，")}
                    placeholder="关键词"
                    disabled={isSending}
                    className="h-8"
                    onChange={(event) => onUpdateLorebookEntry(entry.id, {
                      keywords: parseLoreKeywords(event.target.value),
                    })}
                  />
                  <Textarea
                    value={entry.content}
                    disabled={isSending}
                    className="min-h-[92px] resize-none text-sm leading-6"
                    onChange={(event) => onUpdateLorebookEntry(entry.id, { content: event.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        disabled={isSending}
                        onChange={(event) => onUpdateLorebookEntry(entry.id, {
                          enabled: event.target.checked,
                        })}
                      />
                      启用
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.alwaysOn}
                        disabled={isSending}
                        onChange={(event) => onUpdateLorebookEntry(entry.id, {
                          alwaysOn: event.target.checked,
                        })}
                      />
                      常驻
                    </label>
                  </div>
                </div>
              ))}
              {activeRoom.lorebookEntries.length === 0 && (
                <div className="rounded-md border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
                  暂无世界书。
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-semibold">房间操作</div>
            <input
              ref={roomImportInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportRoomFile}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSending || isExtractingAssets}
                onClick={onExportRoom}
              >
                <Copy className="size-4" />
                导出
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSending || isExtractingAssets}
                onClick={() => {
                  setRoomImportStatus("");
                  roomImportInputRef.current?.click();
                }}
              >
                <Plus className="size-4" />
                导入
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSending || isExtractingAssets}
                onClick={onClearRoomMessages}
              >
                <RotateCcw className="size-4" />
                清空
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={isSending || isExtractingAssets || !canDeleteRoom}
                onClick={onDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除
              </Button>
            </div>
            {roomImportStatus && (
              <div className="text-xs text-muted-foreground">{roomImportStatus}</div>
            )}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
};
