import { ChevronDown, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatInputStore } from "../store";

type ToolMenuProps = {
  disabled: boolean;
};

export const ToolMenu = ({ disabled }: ToolMenuProps) => {
  const resourceStore = useChatInputStore();
  const tools = resourceStore.resources.tools ?? [];
  const selectedToolCount = tools.filter((tool) =>
    resourceStore.optionValues.selectedToolNames.includes(tool.value),
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 cursor-pointer px-2 text-xs"
          title={`已选择 ${selectedToolCount} 个工具`}
        >
          <Wrench className="size-3.5" aria-hidden="true" />
          <span>工具</span>
          <span className="text-muted-foreground">{selectedToolCount}</span>
          <ChevronDown className="size-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>工具</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tools.length === 0 ? (
          <DropdownMenuItem disabled>暂无工具</DropdownMenuItem>
        ) : (
          tools.map((tool) => (
            <DropdownMenuCheckboxItem
              key={tool.value}
              checked={resourceStore.optionValues.selectedToolNames.includes(tool.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                resourceStore.setSelectedToolNames(
                  checked
                    ? [...new Set([...resourceStore.optionValues.selectedToolNames, tool.value])]
                    : resourceStore.optionValues.selectedToolNames.filter((name) => name !== tool.value),
                )
              }
              title={tool.description || undefined}
            >
              {tool.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
