import { useEffect, useMemo, useState } from "react";
import { Check, Save } from "lucide-react";
import {
  defaultTavernAvatar,
  normalizeTavernAvatarId,
  tavernAvatarGroups,
  tavernAvatarOptions,
} from "@/assets/agent-avatars";
import type { LlmProvider } from "@/ai/llm/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernCharacterModelConfig } from "../types";

export type TavernCharacterFormValue = {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  modelConfig?: TavernCharacterModelConfig;
};

type TavernCharacterFormDialogProps = {
  open: boolean;
  character: TavernCharacter | null;
  modelConfig?: TavernCharacterModelConfig;
  providers?: LlmProvider[];
  roomModelLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: TavernCharacterFormValue) => void;
};

export const TavernCharacterFormDialog = ({
  open,
  character,
  modelConfig,
  providers = [],
  roomModelLabel = "未选择",
  onOpenChange,
  onSubmit,
}: TavernCharacterFormDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [goals, setGoals] = useState("");
  const [relationships, setRelationships] = useState("");
  const [avatar, setAvatar] = useState(normalizeTavernAvatarId(tavernAvatarOptions[0]?.id));
  const [modelMode, setModelMode] = useState<"room" | "custom">("room");
  const [selectedModelConfig, setSelectedModelConfig] = useState<
    TavernCharacterModelConfig | undefined
  >(undefined);
  const [formError, setFormError] = useState("");
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);

  const modelProviders = useMemo(
    () => providers.filter((provider) => provider.models.some((model) => model.isEnabled)),
    [providers],
  );
  const selectedProvider = selectedModelConfig?.providerId
    ? modelProviders.find((provider) => provider.id === selectedModelConfig.providerId)
    : null;
  const selectedModels = selectedProvider?.models.filter((model) => model.isEnabled) ?? [];
  const selectedAvatar = useMemo(
    () => tavernAvatarOptions.find((option) => option.id === avatar) ?? defaultTavernAvatar,
    [avatar],
  );

  const firstEnabledModelConfigForProvider = (
    providerId: string,
  ): TavernCharacterModelConfig | undefined => {
    const provider = modelProviders.find((item) => item.id === providerId);
    const model = provider?.models.find((item) => item.isEnabled);
    return provider && model
      ? {
          providerId: provider.id,
          modelId: model.id,
        }
      : undefined;
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(character?.name ?? "");
    setDescription(character?.description ?? "");
    setSpeakingStyle(character?.speakingStyle ?? "");
    setGoals(character?.goals ?? "");
    setRelationships(character?.relationships ?? "");
    setAvatar(normalizeTavernAvatarId(character?.avatar ?? tavernAvatarOptions[0]?.id));
    const validModelConfig = modelConfig && modelProviders.some((provider) =>
      provider.id === modelConfig.providerId &&
      provider.models.some((model) => model.id === modelConfig.modelId && model.isEnabled)
    )
      ? modelConfig
      : undefined;
    setModelMode(validModelConfig ? "custom" : "room");
    setSelectedModelConfig(validModelConfig);
    setFormError("");
  }, [character, modelConfig, modelProviders, open]);

  useEffect(() => {
    if (!open) {
      setIsAvatarPickerOpen(false);
    }
  }, [open]);

  const handleSubmit = () => {
    const nextName = name.trim();
    const nextDescription = description.trim();
    const nextSpeakingStyle = speakingStyle.trim();

    if (!nextName || !nextDescription || !nextSpeakingStyle) {
      setFormError("请补全角色名称、设定和说话方式。");
      return;
    }

    if (modelMode === "custom" && !selectedModelConfig) {
      setFormError("请选择模型，或改为跟随酒馆。");
      return;
    }

    onSubmit({
      name: nextName,
      avatar,
      description: nextDescription,
      speakingStyle: nextSpeakingStyle,
      goals: goals.trim() || undefined,
      relationships: relationships.trim() || undefined,
      modelConfig: modelMode === "custom" ? selectedModelConfig : undefined,
    });
    onOpenChange(false);
  };

  const renderModelControls = () => (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <label className="block space-y-1.5" htmlFor="tavern-character-model-mode">
        <span className="text-xs font-medium text-muted-foreground">模型策略</span>
        <NativeSelect
          id="tavern-character-model-mode"
          value={modelMode}
          onChange={(event) => {
            const nextMode = event.target.value === "custom" ? "custom" : "room";
            setModelMode(nextMode);
            setSelectedModelConfig(
              nextMode === "custom"
                ? selectedModelConfig ??
                  firstEnabledModelConfigForProvider(modelProviders[0]?.id ?? "")
                : undefined,
            );
          }}
        >
          <NativeSelectOption value="room">跟随酒馆</NativeSelectOption>
          <NativeSelectOption value="custom" disabled={modelProviders.length === 0}>
            自定义
          </NativeSelectOption>
        </NativeSelect>
        <span className="block text-xs leading-5 text-muted-foreground">
          跟随酒馆时使用：{roomModelLabel}
        </span>
      </label>
      {modelMode === "custom" && selectedModelConfig && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5" htmlFor="tavern-character-provider">
            <span className="text-xs font-medium text-muted-foreground">供应商</span>
            <NativeSelect
              id="tavern-character-provider"
              value={selectedModelConfig.providerId}
              onChange={(event) => {
                setSelectedModelConfig(
                  firstEnabledModelConfigForProvider(event.target.value),
                );
              }}
            >
              {modelProviders.map((provider) => (
                <NativeSelectOption key={provider.id} value={provider.id}>
                  {provider.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="block space-y-1.5" htmlFor="tavern-character-model">
            <span className="text-xs font-medium text-muted-foreground">模型</span>
            <NativeSelect
              id="tavern-character-model"
              value={selectedModelConfig.modelId}
              onChange={(event) => {
                setSelectedModelConfig({
                  ...selectedModelConfig,
                  modelId: event.target.value,
                });
              }}
            >
              {selectedModels.map((model) => (
                <NativeSelectOption key={model.id} value={model.id}>
                  {model.modelName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{character ? "编辑角色" : "新建角色"}</DialogTitle>
          <DialogDescription>
            编辑角色基础定义，并配置该角色使用的模型策略。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
              <button
                type="button"
                className="flex aspect-square w-full items-center justify-center rounded-md border bg-background p-1.5 shadow-xs transition-all hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`更换头像：${selectedAvatar.label}`}
                aria-haspopup="dialog"
                aria-expanded={isAvatarPickerOpen}
                onClick={() => setIsAvatarPickerOpen(true)}
              >
                <img
                  src={selectedAvatar.src}
                  alt=""
                  className="size-full rounded-[5px] object-cover"
                />
              </button>

              <div className="min-w-0 space-y-3">
                <label className="block space-y-1.5" htmlFor="tavern-character-name">
                  <span className="text-xs font-medium text-muted-foreground">角色名称</span>
                  <Input
                    id="tavern-character-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {renderModelControls()}
              </div>
            </div>

            <label className="block space-y-1.5" htmlFor="tavern-character-description">
              <span className="text-xs font-medium text-muted-foreground">角色设定</span>
              <Textarea
                id="tavern-character-description"
                value={description}
                className="min-h-[112px] resize-none text-sm leading-6"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5" htmlFor="tavern-character-style">
              <span className="text-xs font-medium text-muted-foreground">说话方式</span>
              <Textarea
                id="tavern-character-style"
                value={speakingStyle}
                className="min-h-[88px] resize-none text-sm leading-6"
                onChange={(event) => setSpeakingStyle(event.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="tavern-character-goals">
                <span className="text-xs font-medium text-muted-foreground">目标</span>
                <Textarea
                  id="tavern-character-goals"
                  value={goals}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setGoals(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5" htmlFor="tavern-character-relationships">
                <span className="text-xs font-medium text-muted-foreground">关系</span>
                <Textarea
                  id="tavern-character-relationships"
                  value={relationships}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setRelationships(event.target.value)}
                />
              </label>
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit}>
            <Save className="size-4" />
            保存角色
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={isAvatarPickerOpen} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>选择头像</DialogTitle>
            <DialogDescription>
              {name.trim() ? `为「${name.trim()}」选择角色头像。` : "为角色选择头像。"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="max-h-[min(70vh,640px)] space-y-5 px-5 py-4">
              {tavernAvatarGroups.map((group) => (
                <section key={group.id} className="space-y-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">{group.label}</div>
                    <div className="text-[11px] leading-4 text-muted-foreground">
                      {group.description}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {group.options.map((avatarOption) => {
                      const isSelected = avatar === avatarOption.id;

                      return (
                        <button
                          key={avatarOption.id}
                          type="button"
                          className={cn(
                            "group relative rounded-md border bg-card p-1.5 text-left shadow-xs transition-all hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            isSelected
                              ? "border-primary/50 ring-1 ring-primary/20"
                              : "border-transparent",
                          )}
                          title={avatarOption.label}
                          aria-label={`选择头像：${avatarOption.label}`}
                          aria-pressed={isSelected}
                          onClick={() => {
                            setAvatar(avatarOption.id);
                            setIsAvatarPickerOpen(false);
                          }}
                        >
                          <img
                            src={avatarOption.src}
                            alt=""
                            className="aspect-square w-full rounded-md object-cover"
                          />
                          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                            {avatarOption.label}
                          </span>
                          {isSelected && (
                            <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                              <Check className="size-3.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAvatarPickerOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
