import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Leaf,
  ListFilter,
  Loader2,
  Monitor,
  Search,
} from "lucide-react";
import { getSkills, installSkillFromMarketplace, searchSkillMarketplace } from "@/api/skills";
import { Button } from "design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { TooltipProvider } from "design-system/components/ui/tooltip";
import { useSkillsStore } from "../store";
import type { MarketplaceSkill, SearchSkillMarketplaceInput, SkillMarketplaceSort } from "../types";
import { MarketplaceResult } from "./marketplace";
import { DEFAULT_MARKETPLACE_SORT, useMarketplaceStore } from "./store";

export const DiscoverSkillsTab = () => {
  const skillsStore = useSkillsStore();
  const marketplaceStore = useMarketplaceStore();
  const [error, setError] = useState("");
  const [isMarketplaceSearching, setIsMarketplaceSearching] = useState(false);
  const [isMarketplaceLoadingMore, setIsMarketplaceLoadingMore] = useState(false);
  const [marketplaceQuery, setMarketplaceQuery] = useState(marketplaceStore.query);
  const [selectedSortBy, setSelectedSortBy] = useState<SkillMarketplaceSort>(
    marketplaceStore.sortBy || DEFAULT_MARKETPLACE_SORT,
  );
  const [selectedCategory, setSelectedCategory] = useState(marketplaceStore.query ? "" : "全部");
  const [installingSkillKey, setInstallingSkillKey] = useState<string | null>(null);
  const [categoryScrollState, setCategoryScrollState] = useState({
    canScroll: false,
    atEnd: false,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollerRef = useRef<HTMLDivElement | null>(null);
  const didRequestInitialSearchRef = useRef(false);
  const searchRequestRef = useRef(0);
  const isInstalling = installingSkillKey !== null;

  const installedAppSkillNames = useMemo(
    () => new Set(skillsStore.skills.filter((skill) => skill.source === "app").map((skill) => skill.name)),
    [skillsStore.skills],
  );

  const searchMarketplace = useCallback(
    async (input: SearchSkillMarketplaceInput) => {
      const normalizedInput = {
        ...input,
        page: input.page ?? 1,
        limit: input.limit ?? 12,
      };
      const isAppend = normalizedInput.append === true;
      const requestId = ++searchRequestRef.current;

      if (!isAppend && marketplaceStore.restoreCache(normalizedInput)) {
        setError("");
        setIsMarketplaceSearching(false);
        setIsMarketplaceLoadingMore(false);
        return;
      }

      if (isAppend) {
        setIsMarketplaceLoadingMore(true);
      } else {
        setIsMarketplaceSearching(true);
        setIsMarketplaceLoadingMore(false);
      }
      setError("");

      try {
        const result = await searchSkillMarketplace(normalizedInput);
        if (requestId === searchRequestRef.current) {
          marketplaceStore.setSearchResult(normalizedInput, result);
        }
      } catch (caught) {
        if (requestId === searchRequestRef.current) {
          setError(String(caught));
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          if (isAppend) {
            setIsMarketplaceLoadingMore(false);
          } else {
            setIsMarketplaceSearching(false);
          }
        }
      }
    },
    [marketplaceStore.restoreCache, marketplaceStore.setSearchResult],
  );

  const runSearch = useCallback(
    async ({
      query = marketplaceQuery,
      sortBy = selectedSortBy,
      page = 1,
      append = false,
    }: Partial<SearchSkillMarketplaceInput> = {}) => {
      const nextQuery = query.trim();
      await searchMarketplace({
        query: nextQuery,
        sortBy,
        page,
        limit: marketplaceStore.pagination?.limit ?? 12,
        append,
      });
    },
    [
      marketplaceQuery,
      marketplaceStore.pagination?.limit,
      searchMarketplace,
      selectedSortBy,
    ],
  );

  useEffect(() => {
    if (didRequestInitialSearchRef.current || marketplaceStore.hasLoaded) {
      return;
    }
    didRequestInitialSearchRef.current = true;
    void runSearch({ query: "", sortBy: selectedSortBy });
  }, [marketplaceStore.hasLoaded, runSearch, selectedSortBy]);

  const handleCategorySearch = (category: DiscoverCategory) => {
    setSelectedCategory(category.label);
    setMarketplaceQuery(category.query);
    void runSearch({ query: category.query, page: 1 });
  };

  const handleSortChange = (value: string) => {
    const sortBy = value as SkillMarketplaceSort;
    const selectedCategoryQuery = DISCOVER_CATEGORIES.find((category) => category.label === selectedCategory)?.query;
    setSelectedSortBy(sortBy);
    void runSearch({
      query: selectedCategoryQuery ?? marketplaceQuery,
      sortBy,
      page: 1,
    });
  };

  const handleSearch = () => {
    setSelectedCategory(marketplaceQuery.trim() ? "" : "全部");
    void runSearch({ page: 1 });
  };

  const handleInstallSkill = useCallback(
    async (skill: MarketplaceSkill) => {
      if (isInstalling || installingSkillKey) {
        return;
      }

      setInstallingSkillKey(marketplaceSkillKey(skill));
      setError("");
      try {
        const installedSkill = await installSkillFromMarketplace({
          source: skill.githubUrl || skill.skillUrl,
          skillName: skill.name,
          sourceKind: "remote",
        });
        skillsStore.setSkillSettings(await getSkills());
        toast.success("技能导入成功", {
          description: `${installedSkill.name} 已添加到 Skill库`,
        });
      } catch (caught) {
        setError(String(caught));
      } finally {
        setInstallingSkillKey(null);
      }
    },
    [installingSkillKey, isInstalling, skillsStore.setSkillSettings],
  );

  const updateCategoryScrollState = useCallback(() => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const canScroll = maxScrollLeft > 1;
    const atEnd = !canScroll || scroller.scrollLeft >= maxScrollLeft - 2;

    setCategoryScrollState((current) =>
      current.canScroll === canScroll && current.atEnd === atEnd ? current : { canScroll, atEnd },
    );
  }, []);

  const handleCategoryScroll = () => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    if (categoryScrollState.atEnd) {
      scroller.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    scroller.scrollBy({
      left: Math.max(scroller.clientWidth * 0.8, 160),
      behavior: "smooth",
    });
  };

  const handleLoadMore = useCallback(() => {
    if (!marketplaceStore.pagination?.hasNext || isMarketplaceSearching || isMarketplaceLoadingMore) {
      return;
    }

    void runSearch({
      query: marketplaceStore.query || marketplaceQuery,
      sortBy: marketplaceStore.sortBy || selectedSortBy,
      page: marketplaceStore.pagination.page + 1,
      append: true,
    });
  }, [
    isMarketplaceLoadingMore,
    isMarketplaceSearching,
    marketplaceQuery,
    marketplaceStore.pagination,
    marketplaceStore.query,
    marketplaceStore.sortBy,
    runSearch,
    selectedSortBy,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (remaining < 220) {
        handleLoadMore();
      }
    };

    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [handleLoadMore]);

  useEffect(() => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    updateCategoryScrollState();

    const handleScroll = () => updateCategoryScrollState();
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateCategoryScrollState);
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateCategoryScrollState]);

  return (
    <ScrollArea viewportRef={viewportRef} className="h-full bg-background">
      <div className="space-y-4 px-5 pt-4 pb-8 lg:px-8">
        <section className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              ref={categoryScrollerRef}
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-smooth pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {DISCOVER_CATEGORIES.map((category) => (
                <button
                  key={category.label}
                  type="button"
                  className={[
                    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25",
                    category.label === "全部" ? "min-w-[108px] justify-center" : "",
                    selectedCategory === category.label
                      ? "border border-border/75 bg-card text-foreground shadow-xs"
                      : "border border-transparent bg-muted/70 text-muted-foreground hover:border-border/60 hover:bg-card hover:text-foreground",
                  ].join(" ")}
                  onClick={() => handleCategorySearch(category)}
                >
                  {category.icon}
                  <span>{category.label}</span>
                </button>
              ))}
            </div>

            {categoryScrollState.canScroll && (
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/65 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                onClick={handleCategoryScroll}
                aria-label={categoryScrollState.atEnd ? "向左查看更多分类" : "向右查看更多分类"}
              >
                {categoryScrollState.atEnd ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-10 w-[220px] items-center gap-2 rounded-xl border border-border/75 bg-card py-1 pr-1 pl-3 shadow-xs">
              <Input
                className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                value={marketplaceQuery}
                onChange={(event) => setMarketplaceQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
                placeholder="搜索技能"
                disabled={isMarketplaceSearching || isInstalling}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="size-8 rounded-full text-muted-foreground/45 hover:text-muted-foreground/65"
                onClick={handleSearch}
                disabled={isMarketplaceSearching || isInstalling}
                aria-label="搜索技能"
              >
                {isMarketplaceSearching ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group inline-flex h-10 w-[116px] items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/65 px-4 text-sm font-medium whitespace-nowrap text-muted-foreground shadow-none outline-none transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary/30 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                  disabled={isMarketplaceSearching || isInstalling}
                >
                  <ListFilter className="size-4 text-foreground/65 transition-colors group-hover:text-foreground/75 group-data-[state=open]:text-foreground/75" />
                  <span>{SORT_LABELS[selectedSortBy]}</span>
                  <ChevronDown className="size-4 text-foreground/50 transition-transform group-hover:text-foreground/65 group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground/65" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-30 min-w-30 rounded-xl border border-border/70 bg-popover p-2 shadow-[var(--shadow-floating)] ring-0"
              >
                <DropdownMenuRadioGroup value={selectedSortBy} onValueChange={handleSortChange}>
                  <DropdownMenuRadioItem
                    value="stars"
                    className="h-10 rounded-lg px-4 pr-10 text-sm font-medium text-muted-foreground focus:bg-accent/60 focus:text-accent-foreground data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:text-primary"
                  >
                    最热
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="updatedAt"
                    className="h-10 rounded-lg px-4 pr-10 text-sm font-medium text-muted-foreground focus:bg-accent/60 focus:text-accent-foreground data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:text-primary"
                  >
                    最新
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section>
          {isMarketplaceSearching || (!marketplaceStore.hasLoaded && !error) ? (
            <SearchLoadingState />
          ) : marketplaceStore.results.length > 0 ? (
            <TooltipProvider delayDuration={220}>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {marketplaceStore.results.map((skill) => {
                  const resultKey = marketplaceSkillKey(skill);
                  const installed = installedAppSkillNames.has(skill.name);
                  const installing = installingSkillKey === resultKey;
                  return (
                    <MarketplaceResult
                      key={resultKey}
                      skill={skill}
                      installed={installed}
                      installing={installing}
                      actionHidden={Boolean(installingSkillKey) && !installing && !installed}
                      onInstall={() => void handleInstallSkill(skill)}
                    />
                  );
                })}
              </div>
              <LoadMoreState
                isLoading={isMarketplaceLoadingMore}
                hasNext={marketplaceStore.pagination?.hasNext ?? false}
                onLoadMore={handleLoadMore}
              />
            </TooltipProvider>
          ) : (
            <DiscoverEmptyState />
          )}
        </section>
      </div>
    </ScrollArea>
  );
};

type DiscoverCategory = {
  label: string;
  query: string;
  icon: ReactNode;
};

const SORT_LABELS: Record<SkillMarketplaceSort, string> = {
  stars: "最热",
  updatedAt: "最新",
};

const marketplaceSkillKey = (skill: MarketplaceSkill) => skill.githubUrl || skill.skillUrl || skill.name;

const SearchLoadingState = () => (
  <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
    <span>正在搜索技能</span>
  </div>
);

const DiscoverEmptyState = () => (
  <div className="app-empty-state flex min-h-[220px] items-center justify-center gap-2 rounded-2xl text-sm text-muted-foreground">
    <Search className="size-4" />
    <span>暂无技能结果，请重试或搜索关键词</span>
  </div>
);

type LoadMoreStateProps = {
  isLoading: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
};

const LoadMoreState = ({ isLoading, hasNext, onLoadMore }: LoadMoreStateProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        <span>正在加载更多</span>
      </div>
    );
  }

  if (!hasNext) {
    return <div className="py-5 text-center text-xs text-muted-foreground">已加载全部结果</div>;
  }

  return (
    <div className="flex justify-center py-5">
      <Button type="button" variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={onLoadMore}>
        加载更多
      </Button>
    </div>
  );
};

const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  {
    label: "全部",
    query: "",
    icon: null,
  },
  {
    label: "办公学习",
    query: "办公 学习",
    icon: <BriefcaseBusiness className="size-3.5 text-blue-500" />,
  },
  {
    label: "电脑设置",
    query: "电脑 设置",
    icon: <Monitor className="size-3.5 text-blue-500" />,
  },
  {
    label: "生活日常",
    query: "生活 日常",
    icon: <Leaf className="size-3.5 text-green-500" />,
  },
  {
    label: "休闲娱乐",
    query: "休闲 娱乐",
    icon: <Gamepad2 className="size-3.5 text-red-500" />,
  },
];
