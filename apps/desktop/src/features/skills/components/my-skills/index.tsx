import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Folder,
  FolderCog,
  FolderPlus,
  Gamepad2,
  Leaf,
  ListFilter,
  Loader2,
  Monitor,
  Pencil,
  Search,
  BriefcaseBusiness,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSkillsStore } from "../../store";
import type {
  InstallSkillInput,
  RemoveSkillInput,
  WorkspaceSkill,
  WorkspaceSkillGroup,
} from "../../types";
import { EmptyState } from "../shared";
import {
  ALL_SKILLS_GROUP_ID,
  existingGroupSkillNames,
  filterSkills,
} from "../utils";
import {
  GroupDialog,
  type GroupDialogState,
} from "./group-dialog";
import { ImportSkillDialog } from "./import-skill-dialog";
import { SkillListItem } from "./skill-list-item";

type MySkillsTabProps = {
  isLoading: boolean;
  isSaving: boolean;
  isInstalling: boolean;
  isRemoving: boolean;
  onToggleSkill: (key: string, enabled: boolean) => void;
  onToggleGroup: (skillKeys: string[], enabled: boolean) => void;
  onGroupsChange: (groups: WorkspaceSkillGroup[]) => void;
  onInstallSkill: (input: InstallSkillInput) => Promise<void>;
  onRemoveSkill: (input: RemoveSkillInput) => Promise<void>;
};

type SourceFilter = "all" | "system" | "app" | "upload";
type EnabledFilter = "all" | "enabled" | "disabled";

const SOURCE_FILTER_OPTIONS = [
  ["all", "全部来源"],
  ["system", "系统内置"],
  ["app", "在线导入"],
  ["upload", "本地上传"],
] satisfies Array<[SourceFilter, string]>;

const ENABLED_FILTER_OPTIONS = [
  ["all", "全部状态"],
  ["enabled", "已启用"],
  ["disabled", "未启用"],
] satisfies Array<[EnabledFilter, string]>;

const ACTION_MENU_CONTENT_CLASS =
  "w-32 rounded-lg p-1 text-xs shadow-md ring-1 ring-black/[0.05]";
const ACTION_MENU_ITEM_CLASS =
  "h-7 min-h-0 rounded-md px-2 py-0 text-xs leading-none [&_svg]:size-3";
const FILTER_MENU_LABEL_CLASS =
  "px-2 py-1 text-[11px] leading-none text-muted-foreground";
const FILTER_MENU_RADIO_ITEM_CLASS =
  "h-7 min-h-0 rounded-md py-0 pr-7 pl-2 text-xs leading-none [&_svg]:size-3";

export const MySkillsTab = ({
  isLoading,
  isSaving,
  isInstalling,
  isRemoving,
  onToggleSkill,
  onToggleGroup,
  onGroupsChange,
  onInstallSkill,
  onRemoveSkill,
}: MySkillsTabProps) => {
  const {
    skills,
    groups,
    enabledSkillKeys,
  } = useSkillsStore(
    useShallow((store) => ({
      skills: store.skills,
      groups: store.skillGroups,
      enabledSkillKeys: store.enabledSkillKeys,
    })),
  );
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_SKILLS_GROUP_ID);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [groupScrollState, setGroupScrollState] = useState({
    canScroll: false,
    atEnd: false,
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<WorkspaceSkill | null>(null);
  const [removingSkillKey, setRemovingSkillKey] = useState<string | null>(null);
  const [groupDialogState, setGroupDialogState] = useState<GroupDialogState>({
    open: false,
    mode: "create",
    group: null,
  });
  const groupScrollerRef = useRef<HTMLDivElement | null>(null);

  const enabledKeys = useMemo(
    () => new Set(enabledSkillKeys),
    [enabledSkillKeys],
  );
  const skillsByKey = useMemo(
    () => new Map(skills.map((skill) => [skill.key, skill])),
    [skills],
  );
  const selectedGroup =
    selectedGroupId === ALL_SKILLS_GROUP_ID
      ? null
      : groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedGroupSkillKeys = selectedGroup
    ? existingGroupSkillNames(selectedGroup, skillsByKey)
    : skills.map((skill) => skill.key);
  const selectedGroupName = selectedGroup?.name ?? "全部技能";
  const selectedGroupEnabledCount = selectedGroupSkillKeys.filter((key) =>
    enabledKeys.has(key),
  ).length;
  const visibleSkills = selectedGroup
    ? skills.filter((skill) => selectedGroupSkillKeys.includes(skill.key))
    : skills;
  const filteredSkills = useMemo(
    () => visibleSkills.filter((skill) =>
      matchesSourceFilter(skill, sourceFilter)
      && matchesEnabledFilter(skill.key, enabledFilter, enabledKeys),
    ),
    [enabledFilter, enabledKeys, sourceFilter, visibleSkills],
  );
  const displayedSkills = useMemo(
    () => filterSkills(filteredSkills, skillSearchQuery),
    [filteredSkills, skillSearchQuery],
  );

  useEffect(() => {
    if (
      selectedGroupId !== ALL_SKILLS_GROUP_ID
      && !groups.some((group) => group.id === selectedGroupId)
    ) {
      setSelectedGroupId(ALL_SKILLS_GROUP_ID);
    }
  }, [groups, selectedGroupId]);

  const updateGroupScrollState = useCallback(() => {
    const scroller = groupScrollerRef.current;
    if (!scroller) {
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const canScroll = maxScrollLeft > 1;
    const atEnd = !canScroll || scroller.scrollLeft >= maxScrollLeft - 2;

    setGroupScrollState((current) =>
      current.canScroll === canScroll && current.atEnd === atEnd
        ? current
        : { canScroll, atEnd },
    );
  }, []);

  const handleGroupScroll = () => {
    const scroller = groupScrollerRef.current;
    if (!scroller) {
      return;
    }

    if (groupScrollState.atEnd) {
      scroller.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    scroller.scrollBy({
      left: Math.max(scroller.clientWidth * 0.8, 160),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const scroller = groupScrollerRef.current;
    if (!scroller) {
      return;
    }

    updateGroupScrollState();

    const handleScroll = () => updateGroupScrollState();
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateGroupScrollState);
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [groups.length, updateGroupScrollState]);

  const openCreateGroup = () => {
    setGroupDialogState({
      open: true,
      mode: "create",
      group: null,
    });
  };

  const openViewGroup = (
    group: WorkspaceSkillGroup | null,
    fallbackName = "全部技能",
    fallbackSkillNames = skills.map((skill) => skill.key),
  ) => {
    setGroupDialogState({
      open: true,
      mode: "view",
      group,
      fallbackName,
      fallbackSkillNames,
    });
  };

  const openEditGroup = (group: WorkspaceSkillGroup) => {
    if (group.readonly) {
      openViewGroup(group);
      return;
    }
    setGroupDialogState({
      open: true,
      mode: "edit",
      group,
    });
  };

  const handleConfirmRemoveSkill = useCallback(async () => {
    if (!pendingRemoveSkill || isRemoving) {
      return;
    }

    setRemovingSkillKey(pendingRemoveSkill.key);
    try {
      await onRemoveSkill({
        key: pendingRemoveSkill.key,
        name: pendingRemoveSkill.name,
        path: pendingRemoveSkill.path,
      });
      setPendingRemoveSkill(null);
    } finally {
      setRemovingSkillKey(null);
    }
  }, [isRemoving, onRemoveSkill, pendingRemoveSkill]);

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 flex-col bg-[#f6f6f5]">
        <div className="shrink-0 px-5 pb-4 lg:px-10">
          <section className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div
                ref={groupScrollerRef}
                className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-smooth pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <CategoryPill
                  id={ALL_SKILLS_GROUP_ID}
                  name="全部"
                  selected={selectedGroupId === ALL_SKILLS_GROUP_ID}
                  onSelect={setSelectedGroupId}
                />
                {groups.map((group) => (
                  <CategoryPill
                    key={group.id}
                    id={group.id}
                    name={group.name}
                    selected={selectedGroupId === group.id}
                    onSelect={setSelectedGroupId}
                  />
                ))}
              </div>

              {groupScrollState.canScroll && (
                <button
                  type="button"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-foreground/65 transition-colors hover:bg-black/[0.06] hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                  onClick={handleGroupScroll}
                  aria-label={
                    groupScrollState.atEnd ? "向左查看更多分组" : "向右查看更多分组"
                  }
                >
                  {groupScrollState.atEnd ? (
                    <ChevronLeft className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              )}
            </div>

            <div className="flex h-10 w-[200px] shrink-0 items-center gap-2 rounded-full bg-white px-3 shadow-xs ring-1 ring-black/[0.03]">
              <Input
                className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                value={skillSearchQuery}
                onChange={(event) => setSkillSearchQuery(event.target.value)}
                placeholder="搜索 Skill"
              />
              <Search className="size-4 shrink-0 text-muted-foreground/45" />
            </div>
          </section>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{selectedGroupName}</span>
              <span>已启用 {selectedGroupEnabledCount} 个，共 {visibleSkills.length} 个</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-7 rounded-full px-2"
                  >
                    <ListFilter className="size-3.5" />
                    <span>{filterTriggerLabel(sourceFilter, enabledFilter)}</span>
                    <ChevronRight className="size-3 rotate-90 text-muted-foreground/70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={ACTION_MENU_CONTENT_CLASS}>
                  <DropdownMenuLabel className={FILTER_MENU_LABEL_CLASS}>来源</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sourceFilter}
                    onValueChange={(value) => setSourceFilter(value as SourceFilter)}
                  >
                    {SOURCE_FILTER_OPTIONS.map(([value, label]) => (
                      <DropdownMenuRadioItem
                        key={value}
                        value={value}
                        className={FILTER_MENU_RADIO_ITEM_CLASS}
                      >
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={FILTER_MENU_LABEL_CLASS}>状态</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={enabledFilter}
                    onValueChange={(value) => setEnabledFilter(value as EnabledFilter)}
                  >
                    {ENABLED_FILTER_OPTIONS.map(([value, label]) => (
                      <DropdownMenuRadioItem
                        key={value}
                        value={value}
                        className={FILTER_MENU_RADIO_ITEM_CLASS}
                      >
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-7 rounded-full px-2"
                  >
                    <FolderCog className="size-3.5" />
                    <span>分组</span>
                    <ChevronRight className="size-3 rotate-90 text-muted-foreground/70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={ACTION_MENU_CONTENT_CLASS}>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    onSelect={() => openViewGroup(selectedGroup)}
                  >
                    <Folder className="size-3" />
                    <span>查看分组</span>
                  </DropdownMenuItem>
                  {selectedGroup && !selectedGroup.readonly && (
                    <DropdownMenuItem
                      className={ACTION_MENU_ITEM_CLASS}
                      onSelect={() => openEditGroup(selectedGroup)}
                    >
                      <Pencil className="size-3" />
                      <span>编辑分组</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    onSelect={openCreateGroup}
                  >
                    <FolderPlus className="size-3" />
                    <span>新增分组</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-7 rounded-full px-2"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>批量</span>
                    <ChevronRight className="size-3 rotate-90 text-muted-foreground/70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={ACTION_MENU_CONTENT_CLASS}>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={selectedGroupSkillKeys.length === 0 || isSaving}
                    onSelect={() => onToggleGroup(selectedGroupSkillKeys, true)}
                  >
                    <CheckCircle2 className="size-3" />
                    <span>启用当前</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={selectedGroupSkillKeys.length === 0 || isSaving}
                    onSelect={() => onToggleGroup(selectedGroupSkillKeys, false)}
                  >
                    <Circle className="size-3" />
                    <span>停用当前</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-7 rounded-full px-2"
                onClick={() => setIsImportDialogOpen(true)}
              >
                <Download className="size-3.5" />
                <span>导入</span>
              </Button>
            </div>
          </div>
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full min-h-0">
            <div className="px-5 pt-1 pb-8 lg:px-10">
              {isLoading ? (
                <EmptyState
                  icon={<Loader2 className="size-4 animate-spin" />}
                  text="正在读取 Skills"
                />
              ) : displayedSkills.length > 0 ? (
                <TooltipProvider delayDuration={220}>
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {displayedSkills.map((skill) => (
                      <SkillListItem
                        key={skill.key}
                        skill={skill}
                        enabled={enabledKeys.has(skill.key)}
                        disabled={isSaving || isRemoving}
                        removable={skill.source === "app" || skill.source === "upload"}
                        removing={removingSkillKey === skill.key}
                        onToggle={onToggleSkill}
                        onRemove={setPendingRemoveSkill}
                      />
                    ))}
                  </div>
                </TooltipProvider>
              ) : (
                <EmptyState
                  icon={<Folder className="size-4" />}
                  text={visibleSkills.length > 0 ? "没有匹配的技能" : "暂无可用 Skills"}
                />
              )}
            </div>
          </ScrollArea>
        </main>
      </div>

      <GroupDialog
        state={groupDialogState}
        groups={groups}
        skills={skills}
        skillsByKey={skillsByKey}
        onOpenChange={(open) =>
          setGroupDialogState((current) => ({
            ...current,
            open,
          }))
        }
        onGroupsChange={onGroupsChange}
        onSelectedGroupChange={setSelectedGroupId}
      />
      <ImportSkillDialog
        open={isImportDialogOpen}
        isInstalling={isInstalling}
        onOpenChange={setIsImportDialogOpen}
        onInstallSkill={onInstallSkill}
      />
      <AlertDialog
        open={pendingRemoveSkill !== null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) {
            setPendingRemoveSkill(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除 Skill？</AlertDialogTitle>
            <AlertDialogDescription>
              将从应用技能目录中移除“{pendingRemoveSkill?.name ?? ""}”。移除后这个
              Skill 会从当前工作区、Skill库和已启用列表中消失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmRemoveSkill();
              }}
            >
              {isRemoving ? "正在移除" : "确认移除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type CategoryPillProps = {
  id: string;
  name: string;
  selected: boolean;
  onSelect: (id: string) => void;
};

const CategoryPill = ({
  id,
  name,
  selected,
  onSelect,
}: CategoryPillProps) => (
  <button
    type="button"
    className={[
      "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-all",
      id === ALL_SKILLS_GROUP_ID ? "min-w-[108px] justify-center" : "",
      selected
        ? "bg-white text-foreground shadow-xs ring-1 ring-black/[0.03]"
        : "bg-black/[0.04] text-foreground/75 hover:bg-white/80",
    ].join(" ")}
    onClick={() => onSelect(id)}
  >
    <CategoryIcon name={name} />
    <span>{name}</span>
  </button>
);

const CategoryIcon = ({ name }: { name: string }) => {
  if (name.includes("办公") || name.includes("创作") || name.includes("工具")) {
    return <BriefcaseBusiness className="size-3.5 text-blue-500" />;
  }
  if (name.includes("电脑") || name.includes("浏览器") || name.includes("自动")) {
    return <Monitor className="size-3.5 text-blue-500" />;
  }
  if (name.includes("生活") || name.includes("命理")) {
    return <Leaf className="size-3.5 text-green-500" />;
  }
  if (name.includes("娱乐") || name.includes("休闲")) {
    return <Gamepad2 className="size-3.5 text-red-500" />;
  }
  return null;
};

const filterTriggerLabel = (
  sourceFilter: SourceFilter,
  enabledFilter: EnabledFilter,
) => {
  const selectedLabels = [
    sourceFilter === "all"
      ? null
      : SOURCE_FILTER_OPTIONS.find(([value]) => value === sourceFilter)?.[1],
    enabledFilter === "all"
      ? null
      : ENABLED_FILTER_OPTIONS.find(([value]) => value === enabledFilter)?.[1],
  ].filter(Boolean);

  return selectedLabels.length > 0 ? selectedLabels.join("/") : "筛选";
};

const matchesSourceFilter = (skill: WorkspaceSkill, filter: SourceFilter) =>
  filter === "all" || skill.source === filter;

const matchesEnabledFilter = (
  skillKey: string,
  filter: EnabledFilter,
  enabledKeys: Set<string>,
) => {
  if (filter === "all") {
    return true;
  }
  const enabled = enabledKeys.has(skillKey);
  return filter === "enabled" ? enabled : !enabled;
};
