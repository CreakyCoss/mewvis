import { Bot, ChevronDown, Orbit, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useChatInputStore } from "../store";

type ModelMenuProps = {
  disabled: boolean;
};

export const ModelMenu = ({ disabled }: ModelMenuProps) => {
  const resourceStore = useChatInputStore();
  const models = resourceStore.resources.models ?? [];
  const agents = resourceStore.resources.agents ?? [];
  const selectedModel = models.find((model) => model.value === resourceStore.optionValues.selectedModelId) ?? null;
  const selectedAgent = agents.find((agent) => agent.value === resourceStore.optionValues.selectedAgentId) ?? null;
  const selectedModelLabel = selectedModel?.selectedLabel ?? "选择模型";
  const selectedAgentLabel = selectedAgent?.label ?? "不使用角色";
  const menuLabel = selectedAgent ? `${selectedModelLabel} · ${selectedAgent.label}` : selectedModelLabel;
  const processLabel = [
    resourceStore.optionValues.showThinkingProcess ? "思考" : "",
    resourceStore.optionValues.showToolCallProcess ? "工具" : "",
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
          className="h-8 min-w-0 max-w-[18rem] cursor-pointer px-2 text-xs"
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
          <DropdownMenuSubTrigger title={selectedModel?.description || selectedModelLabel}>
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
                onValueChange={resourceStore.setSelectedModelId}
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

        <DropdownMenuSub>
          <DropdownMenuSubTrigger title={selectedAgent?.description || selectedAgentLabel}>
            <Bot className="size-3.5" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">角色</span>
            <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedAgentLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup value={selectedAgent?.value ?? ""} onValueChange={resourceStore.setSelectedAgentId}>
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
                resourceStore.setShowThinkingProcess(!resourceStore.optionValues.showThinkingProcess);
              }}
            >
              <span className="min-w-0 flex-1">思考过程</span>
              <Switch
                size="sm"
                checked={resourceStore.optionValues.showThinkingProcess}
                aria-label="思考过程"
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={resourceStore.setShowThinkingProcess}
              />
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center justify-between gap-3 py-2"
              onSelect={(event) => {
                event.preventDefault();
                resourceStore.setShowToolCallProcess(!resourceStore.optionValues.showToolCallProcess);
              }}
            >
              <span className="min-w-0 flex-1">工具调用过程</span>
              <Switch
                size="sm"
                checked={resourceStore.optionValues.showToolCallProcess}
                aria-label="工具调用过程"
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={resourceStore.setShowToolCallProcess}
              />
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
