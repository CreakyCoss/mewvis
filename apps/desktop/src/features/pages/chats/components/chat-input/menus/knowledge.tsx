import { useId } from "react";
import { ChevronDown, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type KnowledgeMenuProps = {
  disabled: boolean;
};

export const KnowledgeMenu = ({ disabled }: KnowledgeMenuProps) => {
  const selectAllId = useId();
  const resourceStore = useChatInputStore();
  const collections = resourceStore.resources.knowledgeCollections ?? [];
  const selectedIds = new Set(resourceStore.options.selectedKnowledgeCollectionIds);
  const selectedCollections = collections.filter((collection) => selectedIds.has(collection.value));
  const hasSelection = selectedCollections.length > 0;
  const areAllSelected = collections.length > 0 && selectedCollections.length === collections.length;
  const selectionLabel = hasSelection ? `${selectedCollections.length} 个` : "未选择";
  const selectionTitle = hasSelection
    ? selectedCollections.map((collection) => collection.label).join("、")
    : "未选择知识库";

  const setCollectionSelected = (collectionId: string, selected: boolean) => {
    const nextIds = new Set(resourceStore.options.selectedKnowledgeCollectionIds);
    if (selected) {
      nextIds.add(collectionId);
    } else {
      nextIds.delete(collectionId);
    }
    resourceStore.updateOptions({ selectedKnowledgeCollectionIds: [...nextIds] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-9 min-w-0 max-w-[13rem] cursor-pointer px-2 text-xs"
          title={`知识库：${selectionTitle}`}
        >
          <Database className="size-3.5 shrink-0" aria-hidden="true" />
          <span>知识库</span>
          <span className="min-w-0 truncate text-muted-foreground">{selectionLabel}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5">
        <div className="flex h-9 items-center gap-2 px-2">
          <DropdownMenuLabel className="min-w-0 flex-1 truncate p-0">参与本次对话</DropdownMenuLabel>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {selectedCollections.length}/{collections.length}
          </span>
          <label htmlFor={selectAllId} className="shrink-0 cursor-pointer text-xs text-muted-foreground">
            全选
          </label>
          <Checkbox
            id={selectAllId}
            checked={areAllSelected ? true : hasSelection ? "indeterminate" : false}
            disabled={collections.length === 0}
            aria-label="全选知识库"
            className="[&_[data-slot=checkbox-indicator]_svg]:stroke-white"
            onCheckedChange={(checked) =>
              resourceStore.updateOptions({
                selectedKnowledgeCollectionIds:
                  checked === true ? collections.map((collection) => collection.value) : [],
              })
            }
          />
        </div>
        <DropdownMenuSeparator />
        {collections.length === 0 ? (
          <DropdownMenuItem disabled className="min-h-14 items-start py-2">
            <span>
              <span className="block text-sm">暂无已启用的知识库</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">请先在知识库设置中启用</span>
            </span>
          </DropdownMenuItem>
        ) : (
          collections.map((collection) => (
            <DropdownMenuCheckboxItem
              key={collection.value}
              checked={selectedIds.has(collection.value)}
              className="min-h-14 items-start py-2"
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => setCollectionSelected(collection.value, checked === true)}
              title={collection.sourceDirectory ?? collection.description ?? undefined}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{collection.label}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {collection.description || collection.sourceDirectory || "已启用知识检索"}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
