import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  normalizeTavernAvatarId,
  tavernAvatarGroups,
  tavernAvatarOptions,
} from "@/assets/agent-avatars";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
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
import type {
  TavernCharacter,
  TavernCharacterModelConfig,
} from "../types";

const MODEL_MODE_INHERIT = "inherit";
const MODEL_MODE_CUSTOM = "custom";

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
  providers: LlmProvider[];
  globalProvider: LlmProvider | null;
  globalModel: ProviderModel | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: TavernCharacterFormValue) => void;
};

export const TavernCharacterFormDialog = ({
  open,
  character,
  providers,
  globalProvider,
  globalModel,
  onOpenChange,
  onSubmit,
}: TavernCharacterFormDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [goals, setGoals] = useState("");
  const [relationships, setRelationships] = useState("");
  const [avatar, setAvatar] = useState(normalizeTavernAvatarId(tavernAvatarOptions[0]?.id));
  const [modelMode, setModelMode] = useState<typeof MODEL_MODE_INHERIT | typeof MODEL_MODE_CUSTOM>(
    MODEL_MODE_INHERIT,
  );
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [formError, setFormError] = useState("");

  const modelProviders = useMemo(
    () => providers.filter((provider) => provider.models.some((model) => model.isEnabled)),
    [providers],
  );
  const selectedProvider = useMemo(
    () => modelProviders.find((provider) => provider.id === providerId)
      ?? modelProviders[0]
      ?? null,
    [modelProviders, providerId],
  );
  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );
  const globalModelLabel = globalProvider && globalModel
    ? `${globalProvider.name} / ${globalModel.modelName}`
    : "未选择";

  useEffect(() => {
    if (!open) {
      return;
    }

    const configuredProvider = character?.modelConfig?.providerId
      ? modelProviders.find((provider) => provider.id === character.modelConfig?.providerId)
      : null;
    const nextProvider = configuredProvider
      ?? (globalProvider ? modelProviders.find((provider) => provider.id === globalProvider.id) : null)
      ?? modelProviders[0]
      ?? null;
    const configuredModel = nextProvider && character?.modelConfig?.modelId
      ? nextProvider.models.find((model) =>
          model.id === character.modelConfig?.modelId && model.isEnabled
        )
      : null;

    setName(character?.name ?? "");
    setDescription(character?.description ?? "");
    setSpeakingStyle(character?.speakingStyle ?? "");
    setGoals(character?.goals ?? "");
    setRelationships(character?.relationships ?? "");
    setAvatar(normalizeTavernAvatarId(character?.avatar ?? tavernAvatarOptions[0]?.id));
    setModelMode(character?.modelConfig ? MODEL_MODE_CUSTOM : MODEL_MODE_INHERIT);
    setProviderId(nextProvider?.id ?? "");
    setModelId(configuredModel?.id ?? nextProvider?.models.find((model) => model.isEnabled)?.id ?? "");
    setFormError("");
  }, [character, globalProvider, modelProviders, open]);

  const handleProviderChange = (nextProviderId: string) => {
    const nextProvider = modelProviders.find((provider) => provider.id === nextProviderId) ?? null;
    setProviderId(nextProvider?.id ?? "");
    setModelId(nextProvider?.models.find((model) => model.isEnabled)?.id ?? "");
  };

  const handleSubmit = () => {
    const nextName = name.trim();
    const nextDescription = description.trim();
    const nextSpeakingStyle = speakingStyle.trim();

    if (!nextName || !nextDescription || !nextSpeakingStyle) {
      setFormError("请补全角色名称、设定和说话方式。");
      return;
    }

    if (modelMode === MODEL_MODE_CUSTOM && (!providerId || !modelId)) {
      setFormError("请选择角色专属模型。");
      return;
    }

    onSubmit({
      name: nextName,
      avatar,
      description: nextDescription,
      speakingStyle: nextSpeakingStyle,
      goals: goals.trim() || undefined,
      relationships: relationships.trim() || undefined,
      modelConfig: modelMode === MODEL_MODE_CUSTOM
        ? {
            providerId,
            modelId,
          }
        : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{character ? "编辑角色" : "新建角色"}</DialogTitle>
          <DialogDescription>
            角色是全局配置，保存后会影响所有引用它的酒馆。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <label className="block space-y-1.5" htmlFor="tavern-character-name">
              <span className="text-xs font-medium text-muted-foreground">角色名称</span>
              <Input
                id="tavern-character-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

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

            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">角色专属模型</div>
              <NativeSelect
                className="w-full"
                value={modelMode}
                onChange={(event) => setModelMode(
                  event.target.value === MODEL_MODE_CUSTOM
                    ? MODEL_MODE_CUSTOM
                    : MODEL_MODE_INHERIT,
                )}
              >
                <NativeSelectOption value={MODEL_MODE_INHERIT}>
                  跟随默认：{globalModelLabel}
                </NativeSelectOption>
                <NativeSelectOption value={MODEL_MODE_CUSTOM} disabled={modelProviders.length === 0}>
                  自定义角色模型
                </NativeSelectOption>
              </NativeSelect>
              {modelMode === MODEL_MODE_CUSTOM && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <NativeSelect
                    className="w-full"
                    value={providerId}
                    disabled={modelProviders.length === 0}
                    onChange={(event) => handleProviderChange(event.target.value)}
                  >
                    {modelProviders.map((provider) => (
                      <NativeSelectOption key={provider.id} value={provider.id}>
                        {provider.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    className="w-full"
                    value={modelId}
                    disabled={selectedModels.length === 0}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {selectedModels.map((model) => (
                      <NativeSelectOption key={model.id} value={model.id}>
                        {model.modelName}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">头像</div>
              <div className="space-y-3">
                {tavernAvatarGroups.map((group) => (
                  <section key={group.id} className="space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <div className="text-xs font-medium text-foreground">{group.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {group.options.length} 个头像
                      </div>
                    </div>
                    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                      {group.options.map((avatarOption) => (
                        <button
                          key={avatarOption.id}
                          type="button"
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-md border bg-muted/20 p-1 transition-colors hover:bg-muted/45",
                            avatar === avatarOption.id && "border-primary bg-primary/10",
                          )}
                          title={avatarOption.label}
                          aria-label={avatarOption.label}
                          onClick={() => setAvatar(avatarOption.id)}
                        >
                          <img
                            src={avatarOption.src}
                            alt=""
                            className="size-full rounded-[5px] object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
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
    </Dialog>
  );
};
