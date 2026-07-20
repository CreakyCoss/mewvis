import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Gamepad2,
  Leaf,
  Loader2,
  Monitor,
  Plus,
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSkillsStore } from "../../store";
import type { InstallSkillInput, RemoveSkillInput, WorkspaceSkill, WorkspaceSkillGroup } from "../../types";
import { EmptyState } from "../shared";
import { ALL_SKILLS_GROUP_ID, existingGroupSkillNames, filterSkills, groupSkillsBySource } from "../utils";
import { GroupDialog, type GroupDialogState } from "./group-dialog";
import { ImportSkillDialog } from "./import-skill-dialog";
import { SkillListItem } from "./skill-list-item";

type MySkillsTabProps = {
  isLoading: boolean;
  isSaving: boolean;
  isInstalling: boolean;
  isRemoving: boolean;
  defaultSkillGroupId: string;
  onGroupsChange: (groups: WorkspaceSkillGroup[], defaultGroupId?: string) => void;
  onDefaultGroupChange: (groupId: string) => void;
  onInstallSkill: (input: InstallSkillInput) => Promise<void>;
  onRemoveSkill: (input: RemoveSkillInput) => Promise<void>;
};

const QUICK_ACTION_BUTTON_CLASS =
  "size-10 rounded-full bg-white text-foreground/70 shadow-xs ring-1 ring-black/[0.03] hover:bg-white hover:text-foreground focus-visible:ring-sidebar-primary/25";

export const MySkillsTab = ({
  isLoading,
  isSaving,
  isInstalling,
  isRemoving,
  defaultSkillGroupId,
  onGroupsChange,
  onDefaultGroupChange,
  onInstallSkill,
  onRemoveSkill,
}: MySkillsTabProps) => {
  const { skills, groups } = useSkillsStore(
    useShallow((store) => ({
      skills: store.skills,
      groups: store.skillGroups,
    })),
  );
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_SKILLS_GROUP_ID);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(() => new Set());
  const [groupScrollState, setGroupScrollState] = useState({
    canScroll: false,
    atEnd: false,
  });
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<WorkspaceSkill | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<WorkspaceSkillGroup | null>(null);
  const [removingSkillKey, setRemovingSkillKey] = useState<string | null>(null);
  const [groupDialogState, setGroupDialogState] = useState<GroupDialogState>({
    open: false,
    mode: "create",
    group: null,
  });
  const groupScrollerRef = useRef<HTMLDivElement | null>(null);

  const skillsByKey = useMemo(() => new Map(skills.map((skill) => [skill.key, skill])), [skills]);
  const selectedGroup =
    selectedGroupId === ALL_SKILLS_GROUP_ID ? null : (groups.find((group) => group.id === selectedGroupId) ?? null);
  const selectedGroupSkillKeys = selectedGroup
    ? existingGroupSkillNames(selectedGroup, skillsByKey)
    : skills.map((skill) => skill.key);
  const selectedGroupName = selectedGroup?.name ?? "全部技能";
  const visibleSkills = selectedGroup ? skills.filter((skill) => selectedGroupSkillKeys.includes(skill.key)) : skills;
  const displayedSkills = useMemo(
    () => filterSkills(visibleSkills, skillSearchQuery),
    [visibleSkills, skillSearchQuery],
  );
  const displayedSkillGroups = useMemo(() => groupSkillsBySource(displayedSkills), [displayedSkills]);

  useEffect(() => {
    if (selectedGroupId !== ALL_SKILLS_GROUP_ID && !groups.some((group) => group.id === selectedGroupId)) {
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
      current.canScroll === canScroll && current.atEnd === atEnd ? current : { canScroll, atEnd },
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

  const toggleSourceCollapse = (source: string) => {
    setCollapsedSources((current) => {
      const next = new Set(current);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
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

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateGroupScrollState);
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

  const handleConfirmDeleteGroup = useCallback(() => {
    if (!pendingDeleteGroup || pendingDeleteGroup.readonly || isSaving) {
      return;
    }

    onGroupsChange(
      groups.filter((group) => group.id !== pendingDeleteGroup.id),
      pendingDeleteGroup.id === defaultSkillGroupId ? ALL_SKILLS_GROUP_ID : defaultSkillGroupId,
    );
    setSelectedGroupId(ALL_SKILLS_GROUP_ID);
    setPendingDeleteGroup(null);
    setGroupDialogState((current) =>
      current.group?.id === pendingDeleteGroup.id
        ? {
            open: false,
            mode: "create",
            group: null,
          }
        : current,
    );
  }, [defaultSkillGroupId, groups, isSaving, onGroupsChange, pendingDeleteGroup]);

  const closeQuickActionsOnBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsQuickActionOpen(false);
    }
  }, []);

  const openSelectedGroupDetails = () => {
    if (selectedGroup && !selectedGroup.readonly) {
      openEditGroup(selectedGroup);
      return;
    }
    openViewGroup(selectedGroup);
  };

  return (
    <TooltipProvider delayDuration={220}>
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
                    isDefault={defaultSkillGroupId === ALL_SKILLS_GROUP_ID}
                    onSelect={setSelectedGroupId}
                  />
                  {groups.map((group) => (
                    <CategoryPill
                      key={group.id}
                      id={group.id}
                      name={group.name}
                      selected={selectedGroupId === group.id}
                      isDefault={group.id === defaultSkillGroupId}
                      onSelect={setSelectedGroupId}
                    />
                  ))}
                </div>

                {groupScrollState.canScroll && (
                  <button
                    type="button"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-foreground/65 transition-colors hover:bg-black/[0.06] hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                    onClick={handleGroupScroll}
                    aria-label={groupScrollState.atEnd ? "向左查看更多分组" : "向右查看更多分组"}
                  >
                    {groupScrollState.atEnd ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-10 w-[200px] items-center gap-2 rounded-full bg-white px-3 shadow-xs ring-1 ring-black/[0.03]">
                  <Input
                    className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                    value={skillSearchQuery}
                    onChange={(event) => setSkillSearchQuery(event.target.value)}
                    placeholder="搜索 Skill"
                  />
                  <Search className="size-4 shrink-0 text-muted-foreground/45" />
                </div>
                <div
                  className="relative z-30"
                  onMouseEnter={() => setIsQuickActionOpen(true)}
                  onMouseLeave={() => setIsQuickActionOpen(false)}
                  onFocus={() => setIsQuickActionOpen(true)}
                  onBlur={closeQuickActionsOnBlur}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={QUICK_ACTION_BUTTON_CLASS}
                        aria-label="更多 Skill 操作"
                      >
                        <Plus
                          className={["size-4 transition-transform duration-150", isQuickActionOpen ? "rotate-45" : ""]
                            .filter(Boolean)
                            .join(" ")}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={8}>
                      更多操作
                    </TooltipContent>
                  </Tooltip>

                  {isQuickActionOpen && (
                    <div className="animate-in fade-in-0 slide-in-from-top-1 absolute top-full right-0 flex flex-col items-center gap-2 pt-2 duration-150">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={QUICK_ACTION_BUTTON_CLASS}
                            aria-label="导入 Skill"
                            onClick={() => {
                              setIsQuickActionOpen(false);
                              setIsImportDialogOpen(true);
                            }}
                          >
                            <Download className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" sideOffset={8}>
                          导入 Skill
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={QUICK_ACTION_BUTTON_CLASS}
                            aria-label="新增分组"
                            onClick={() => {
                              setIsQuickActionOpen(false);
                              openCreateGroup();
                            }}
                          >
                            <FolderPlus className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" sideOffset={8}>
                          新增分组
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="group/selected-group relative flex max-w-full items-center gap-1.5">
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    className="-ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 font-medium text-foreground transition-colors hover:bg-black/[0.04] hover:text-sidebar-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                    onClick={openSelectedGroupDetails}
                    aria-label={
                      selectedGroup && !selectedGroup.readonly
                        ? `编辑分组：${selectedGroupName}`
                        : `查看分组：${selectedGroupName}`
                    }
                  >
                    <span className="max-w-[220px] truncate">{selectedGroupName}</span>
                  </button>
                </div>
                {selectedGroup && !selectedGroup.readonly && (
                  <div className="pointer-events-none absolute left-0 top-full z-20 pt-1 opacity-0 transition-opacity group-hover/selected-group:pointer-events-auto group-hover/selected-group:opacity-100 group-focus-within/selected-group:pointer-events-auto group-focus-within/selected-group:opacity-100">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-7 rounded-full bg-white px-2.5 text-xs text-destructive shadow-xs ring-1 ring-destructive/10 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`删除分组：${selectedGroupName}`}
                      disabled={isSaving}
                      onClick={() => setPendingDeleteGroup(selectedGroup)}
                    >
                      删除分组
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center">
                <span>共 {visibleSkills.length} 个 Skill</span>
              </div>
            </div>
          </div>

          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full min-h-0">
              <div className="px-5 pt-1 pb-8 lg:px-10">
                {isLoading ? (
                  <EmptyState icon={<Loader2 className="size-4 animate-spin" />} text="正在读取 Skills" />
                ) : displayedSkills.length > 0 ? (
                  <div className="space-y-5">
                    {displayedSkillGroups.map((skillGroup) => {
                      const collapsed = collapsedSources.has(skillGroup.source);

                      return (
                        <section key={skillGroup.source} className="space-y-2">
                          <div className="flex h-8 items-center justify-between px-1">
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-2 rounded-full px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                              aria-expanded={!collapsed}
                              onClick={() => toggleSourceCollapse(skillGroup.source)}
                            >
                              <ChevronRight
                                className={[
                                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                                  collapsed ? "" : "rotate-90",
                                ].join(" ")}
                              />
                              <span className="text-sm font-semibold text-foreground">{skillGroup.label}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {skillGroup.skills.length} 个
                              </span>
                            </button>
                          </div>

                          {!collapsed && (
                            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                              {skillGroup.skills.map((skill) => (
                                <SkillListItem
                                  key={skill.key}
                                  skill={skill}
                                  disabled={isSaving || isRemoving}
                                  removable={skill.source === "app" || skill.source === "upload"}
                                  removing={removingSkillKey === skill.key}
                                  onRemove={setPendingRemoveSkill}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
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
          defaultGroupId={defaultSkillGroupId}
          onOpenChange={(open) =>
            setGroupDialogState((current) => ({
              ...current,
              open,
            }))
          }
          onGroupsChange={onGroupsChange}
          onDefaultGroupChange={onDefaultGroupChange}
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
                将从应用技能目录中移除“{pendingRemoveSkill?.name ?? ""}”。移除后这个 Skill 会从
                Skill库和自定义分组中消失。
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
        <AlertDialog
          open={pendingDeleteGroup !== null}
          onOpenChange={(open) => {
            if (!open && !isSaving) {
              setPendingDeleteGroup(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除分组？</AlertDialogTitle>
              <AlertDialogDescription>
                将删除“{pendingDeleteGroup?.name ?? ""}”分组。分组内的 Skill 不会被删除， 仍会保留在 Skill库中。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isSaving}
                onClick={(event) => {
                  event.preventDefault();
                  handleConfirmDeleteGroup();
                }}
              >
                {isSaving ? "正在删除" : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    </TooltipProvider>
  );
};

type CategoryPillProps = {
  id: string;
  name: string;
  selected: boolean;
  isDefault?: boolean;
  onSelect: (id: string) => void;
};

const CategoryPill = ({ id, name, selected, isDefault = false, onSelect }: CategoryPillProps) => (
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
    {isDefault && (
      <span className="rounded-full bg-sidebar-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-primary">
        默认
      </span>
    )}
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
