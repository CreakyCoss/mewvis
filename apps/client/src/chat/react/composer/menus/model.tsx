import { Bot, Brain, ChevronDown, Orbit, Wrench } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { Switch } from "design-system/components/ui/switch";
import type { useChatControls } from "../../provider";

type ModelMenuProps = {
  controls: ReturnType<typeof useChatControls>;
  disabled: boolean;
  selectionDisabled: boolean;
};

export const ModelMenu = ({ disabled, selectionDisabled, controls }: ModelMenuProps) => {
  const resourceStore = controls;
  const models = resourceStore.resources.models ?? [];
  const agents = resourceStore.resources.agents ?? [];
  const selectedModel = models.find((model) => model.value === resourceStore.options.selectedModelId) ?? null;
  const selectedAgent = agents.find((agent) => agent.value === resourceStore.options.selectedAgentId) ?? null;
  const selectedModelLabel = selectedModel?.selectedLabel ?? "选择模型";
  const thinking = selectedModel?.thinking;
  const thinkingLevel = resourceStore.options.thinkingLevel ?? "";
  const thinkingLabel =
    thinking?.levels.find((option) => option.value === thinkingLevel)?.label ?? (thinkingLevel || "不指定");
  const selectedAgentLabel = selectedAgent?.label ?? "不使用角色";
  const menuLabel = selectedAgent ? `${selectedModelLabel} · ${selectedAgent.label}` : selectedModelLabel;
  const processLabel = [
    resourceStore.options.showThinkingProcess ? "思考" : "",
    resourceStore.options.showToolCallProcess ? "工具" : "",
  ]
    .filter(Boolean)
    .join("/");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-9 min-w-0 max-w-[18rem] cursor-pointer px-2 text-xs"
          title={`模型：${selectedModel?.description || selectedModelLabel}；角色：${selectedAgentLabel}`}
        >
          <Orbit className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{menuLabel}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>模型与角色</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={selectionDisabled} title={selectedModel?.description || selectedModelLabel}>
            <Orbit className="size-3.5" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">模型</span>
            <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedModelLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {models.length === 0 ? (
              <DropdownMenuItem disabled>未配置 LLM</DropdownMenuItem>
            ) : (
              <DropdownMenuRadioGroup
                value={selectedModel?.value ?? ""}
                onValueChange={(selectedModelId) => resourceStore.updateOptions({ selectedModelId })}
              >
                {models.map((model) => (
                  <DropdownMenuRadioItem key={model.value} value={model.value} title={model.description}>
                    <span className="truncate">{model.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {Boolean(thinking?.levels.length) && thinking && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={selectionDisabled}>
              <Brain className="size-3.5" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">思考等级</span>
              <span className="text-xs text-muted-foreground">{thinkingLabel}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                value={thinkingLevel}
                onValueChange={(value) => resourceStore.updateOptions({ thinkingLevel: value || null })}
              >
                <DropdownMenuRadioItem value="">不指定</DropdownMenuRadioItem>
                {thinking.levels.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={selectionDisabled} title={selectedAgent?.description || selectedAgentLabel}>
            <Bot className="size-3.5" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">角色</span>
            <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedAgentLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup
              value={selectedAgent?.value ?? ""}
              onValueChange={(selectedAgentId) => resourceStore.updateOptions({ selectedAgentId })}
            >
              <DropdownMenuRadioItem value="">不使用角色</DropdownMenuRadioItem>
              {agents.length === 0 ? (
                <DropdownMenuItem disabled>暂无角色</DropdownMenuItem>
              ) : (
                agents.map((agent) => (
                  <DropdownMenuRadioItem key={agent.value} value={agent.value} title={agent.description}>
                    <span className="truncate">{agent.label}</span>
                  </DropdownMenuRadioItem>
                ))
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Wrench className="size-3.5" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">过程</span>
            <span className="max-w-28 truncate text-xs text-muted-foreground">{processLabel || "无"}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem
              className="flex items-center justify-between gap-3 py-2"
              onSelect={(event) => {
                event.preventDefault();
                resourceStore.updateOptions({
                  showThinkingProcess: !resourceStore.options.showThinkingProcess,
                });
              }}
            >
              <span className="min-w-0 flex-1">思考过程</span>
              <Switch
                size="sm"
                checked={resourceStore.options.showThinkingProcess}
                aria-label="思考过程"
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(showThinkingProcess) => resourceStore.updateOptions({ showThinkingProcess })}
              />
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center justify-between gap-3 py-2"
              onSelect={(event) => {
                event.preventDefault();
                resourceStore.updateOptions({
                  showToolCallProcess: !resourceStore.options.showToolCallProcess,
                });
              }}
            >
              <span className="min-w-0 flex-1">工具调用过程</span>
              <Switch
                size="sm"
                checked={resourceStore.options.showToolCallProcess}
                aria-label="工具调用过程"
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(showToolCallProcess) => resourceStore.updateOptions({ showToolCallProcess })}
              />
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
