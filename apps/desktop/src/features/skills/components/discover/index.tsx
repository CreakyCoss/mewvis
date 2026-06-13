import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DEFAULT_MARKETPLACE_QUERY,
  DEFAULT_MARKETPLACE_SORT,
  useSkillsStore,
} from "../../store";
import type {
  InstallSkillInput,
  MarketplaceSkill,
  SearchSkillMarketplaceInput,
  SkillMarketplaceSort,
} from "../../types";
import { MarketplaceResult } from "./marketplace-result";

type DiscoverSkillsTabProps = {
  isMarketplaceSearching: boolean;
  isMarketplaceLoadingMore: boolean;
  isInstalling: boolean;
  onSearchMarketplace: (input: SearchSkillMarketplaceInput) => Promise<void>;
  onInstallSkill: (input: InstallSkillInput) => Promise<void>;
};

export const DiscoverSkillsTab = ({
  isMarketplaceSearching,
  isMarketplaceLoadingMore,
  isInstalling,
  onSearchMarketplace,
  onInstallSkill,
}: DiscoverSkillsTabProps) => {
  const {
    skills,
    marketplaceResults,
    marketplacePagination,
    marketplaceQuery: cachedQuery,
    marketplaceSortBy: cachedSortBy,
    marketplaceHasLoaded,
  } = useSkillsStore(
    useShallow((store) => ({
      skills: store.skills,
      marketplaceResults: store.marketplaceResults,
      marketplacePagination: store.marketplacePagination,
      marketplaceQuery: store.marketplaceQuery,
      marketplaceSortBy: store.marketplaceSortBy,
      marketplaceHasLoaded: store.marketplaceHasLoaded,
    })),
  );
  const [marketplaceQuery, setMarketplaceQuery] = useState(() =>
    marketplaceHasLoaded && cachedQuery !== DEFAULT_MARKETPLACE_QUERY
      ? cachedQuery
      : "",
  );
  const [selectedSortBy, setSelectedSortBy] = useState<SkillMarketplaceSort>(
    cachedSortBy || DEFAULT_MARKETPLACE_SORT,
  );
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [installingSkillName, setInstallingSkillName] = useState<string | null>(null);
  const [categoryScrollState, setCategoryScrollState] = useState({
    canScroll: false,
    atEnd: false,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollerRef = useRef<HTMLDivElement | null>(null);
  const hasRequestedInitialSearchRef = useRef(false);

  const installedSkillNames = useMemo(
    () => new Set(skills.map((skill) => skill.name)),
    [skills],
  );

  const runSearch = useCallback(async ({
    query = marketplaceQuery,
    sortBy = selectedSortBy,
    page = 1,
    append = false,
  }: Partial<SearchSkillMarketplaceInput> = {}) => {
    const nextQuery = query.trim() || DEFAULT_MARKETPLACE_QUERY;
    await onSearchMarketplace({
      query: nextQuery,
      sortBy,
      page,
      limit: marketplacePagination?.limit ?? 12,
      append,
    });
  }, [
    marketplacePagination?.limit,
    marketplaceQuery,
    onSearchMarketplace,
    selectedSortBy,
  ]);

  useEffect(() => {
    if (
      hasRequestedInitialSearchRef.current
      || marketplaceHasLoaded
      || isMarketplaceSearching
    ) {
      return;
    }
    hasRequestedInitialSearchRef.current = true;
    void runSearch({
      query: DEFAULT_MARKETPLACE_QUERY,
      sortBy: DEFAULT_MARKETPLACE_SORT,
    });
  }, [isMarketplaceSearching, marketplaceHasLoaded, runSearch]);

  const handleCategorySearch = (category: DiscoverCategory) => {
    setSelectedCategory(category.label);
    void runSearch({ query: category.query, page: 1 });
  };

  const handleSortChange = (value: string) => {
    const sortBy = value as SkillMarketplaceSort;
    const selectedCategoryQuery = DISCOVER_CATEGORIES.find(
      (category) => category.label === selectedCategory,
    )?.query;
    setSelectedSortBy(sortBy);
    void runSearch({
      query: selectedCategoryQuery ?? marketplaceQuery,
      sortBy,
      page: 1,
    });
  };

  const handleSearch = () => {
    setSelectedCategory("");
    void runSearch({ page: 1 });
  };

  const handleInstallSkill = useCallback(async (skill: MarketplaceSkill) => {
    if (isInstalling || installingSkillName) {
      return;
    }

    setInstallingSkillName(skill.name);
    try {
      await onInstallSkill({
        source: skill.githubUrl || skill.skillUrl,
        skillName: skill.name,
      });
    } finally {
      setInstallingSkillName(null);
    }
  }, [installingSkillName, isInstalling, onInstallSkill]);

  const updateCategoryScrollState = useCallback(() => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const canScroll = maxScrollLeft > 1;
    const atEnd = !canScroll || scroller.scrollLeft >= maxScrollLeft - 2;

    setCategoryScrollState((current) =>
      current.canScroll === canScroll && current.atEnd === atEnd
        ? current
        : { canScroll, atEnd },
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
    if (
      !marketplacePagination?.hasNext
      || isMarketplaceSearching
      || isMarketplaceLoadingMore
    ) {
      return;
    }

    void runSearch({
      query: cachedQuery || marketplaceQuery,
      sortBy: cachedSortBy || selectedSortBy,
      page: marketplacePagination.page + 1,
      append: true,
    });
  }, [
    cachedQuery,
    cachedSortBy,
    isMarketplaceLoadingMore,
    isMarketplaceSearching,
    marketplacePagination,
    marketplaceQuery,
    runSearch,
    selectedSortBy,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const remaining =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
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

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateCategoryScrollState);
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateCategoryScrollState]);

  return (
    <ScrollArea viewportRef={viewportRef} className="h-full bg-[#f6f6f5]">
      <div className="space-y-4 px-5 pb-8 lg:px-10">
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
                    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25",
                    category.label === "全部" ? "min-w-[108px] justify-center" : "",
                    selectedCategory === category.label
                      ? "bg-white text-foreground shadow-xs ring-1 ring-black/[0.03]"
                      : "bg-black/[0.04] text-foreground/75 hover:bg-white/80",
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
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-foreground/65 transition-colors hover:bg-black/[0.06] hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                onClick={handleCategoryScroll}
                aria-label={
                  categoryScrollState.atEnd ? "向左查看更多分类" : "向右查看更多分类"
                }
              >
                {categoryScrollState.atEnd ? (
                  <ChevronLeft className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-10 w-[200px] items-center gap-2 rounded-full bg-white py-1 pr-1 pl-3 shadow-xs ring-1 ring-black/[0.03]">
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
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group inline-flex h-10 w-[116px] items-center justify-center gap-2 rounded-full bg-black/[0.04] px-4 text-sm font-medium whitespace-nowrap text-foreground/75 shadow-none outline-none transition-colors hover:bg-black/[0.055] hover:text-foreground/85 focus-visible:ring-2 focus-visible:ring-sidebar-primary/30 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-black/[0.055] data-[state=open]:text-foreground/85"
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
                className="w-30 min-w-30 rounded-[22px] border-0 bg-white p-2 shadow-[0_18px_45px_-28px_rgb(15_23_42_/_0.42)] ring-0"
              >
                <DropdownMenuRadioGroup
                  value={selectedSortBy}
                  onValueChange={handleSortChange}
                >
                  <DropdownMenuRadioItem
                    value="stars"
                    className="h-11 rounded-2xl px-4 pr-10 text-sm font-medium text-foreground/72 focus:bg-black/[0.035] focus:text-foreground/85 data-[state=checked]:bg-black/[0.035] data-[state=checked]:text-foreground/85 [&_[data-slot=dropdown-menu-radio-item-indicator]]:text-foreground/70"
                  >
                    最热
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="updatedAt"
                    className="h-11 rounded-2xl px-4 pr-10 text-sm font-medium text-foreground/72 focus:bg-black/[0.035] focus:text-foreground/85 data-[state=checked]:bg-black/[0.035] data-[state=checked]:text-foreground/85 [&_[data-slot=dropdown-menu-radio-item-indicator]]:text-foreground/70"
                  >
                    最新
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section>
          {isMarketplaceSearching ? (
            <SearchLoadingState />
          ) : marketplaceResults.length > 0 ? (
            <TooltipProvider delayDuration={220}>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {marketplaceResults.map((skill) => {
                  const installed = installedSkillNames.has(skill.name);
                  const installing = installingSkillName === skill.name;
                  return (
                    <MarketplaceResult
                      key={`${skill.skillUrl}-${skill.githubUrl}`}
                      skill={skill}
                      installed={installed}
                      installing={installing}
                      actionHidden={Boolean(installingSkillName) && !installing && !installed}
                      onInstall={() => void handleInstallSkill(skill)}
                    />
                  );
                })}
              </div>
              <LoadMoreState
                isLoading={isMarketplaceLoadingMore}
                hasNext={marketplacePagination?.hasNext ?? false}
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

const SearchLoadingState = () => (
  <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" />
    <span>正在搜索技能</span>
  </div>
);

const DiscoverEmptyState = () => (
  <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-[22px] bg-white/45 text-sm text-muted-foreground ring-1 ring-black/[0.03]">
    <Search className="size-4" />
    <span>输入关键词搜索可安装的技能</span>
  </div>
);

type LoadMoreStateProps = {
  isLoading: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
};

const LoadMoreState = ({
  isLoading,
  hasNext,
  onLoadMore,
}: LoadMoreStateProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>正在加载更多</span>
      </div>
    );
  }

  if (!hasNext) {
    return (
      <div className="py-5 text-center text-xs text-muted-foreground">
        已加载全部结果
      </div>
    );
  }

  return (
    <div className="flex justify-center py-5">
      <Button
        type="button"
        variant="ghost"
        className="h-8 rounded-full px-3 text-xs"
        onClick={onLoadMore}
      >
        加载更多
      </Button>
    </div>
  );
};

const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  {
    label: "全部",
    query: DEFAULT_MARKETPLACE_QUERY,
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
