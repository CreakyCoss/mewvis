import { ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useChatControls } from "../../provider";

export function PermissionMenu({
  controls,
  disabled,
}: {
  controls: ReturnType<typeof useChatControls>;
  disabled: boolean;
}) {
  const mode = controls.options.permissionMode;
  const options = controls.resources.permissionOptions ?? [];
  const selected = options.find((option) => option.mode === mode);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !options.length}
          className="h-9 px-2 text-xs"
          aria-label={`执行权限：${selected?.label ?? "尚未加载"}`}
          title={selected?.description ?? "执行权限尚未加载"}
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {selected?.label ?? "执行权限"}
          <ChevronDown className="size-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuRadioGroup
          value={mode ?? ""}
          onValueChange={(value) => {
            const option = options.find((option) => option.mode === value);
            if (option) controls.updateOptions({ permissionMode: option.mode });
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.mode} value={option.mode} className="items-start py-2">
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
