import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import type { ChatResources } from "@isle/chat-contracts";
import { InputGroupButton } from "design-system/components/ui/input-group";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import type { ChatInputSkillOption } from "@/chat/react/types";
import { ReferenceOptionsList } from "../editor/reference/menu";
import type { SlashReferenceTrigger } from "../editor/reference/skill";
import { getReferenceEntries, referenceGroupLabel, type ReferenceEntry } from "../editor/reference/skill/options";
import { ReferenceEntryContent } from "../editor/reference/skill/row";

type ReferenceInsertMenuProps = {
  anchorRef: RefObject<HTMLDivElement | null>;
  skills: ChatInputSkillOption[];
  skillGroups?: ChatResources["skillGroups"];
  commands?: ChatResources["commands"];
  disabled: boolean;
  slashTrigger: SlashReferenceTrigger | null;
  canInsertCommandAtSelection: () => boolean;
  onSelect: (entry: ReferenceEntry, trigger?: SlashReferenceTrigger) => void;
};

export type ReferenceInsertMenuHandle = {
  handleSlashKeyDown: (event: KeyboardEvent) => void;
};

export const ReferenceInsertMenu = forwardRef<ReferenceInsertMenuHandle, ReferenceInsertMenuProps>(
  function ReferenceInsertMenu(
    {
      anchorRef,
      skills,
      skillGroups = [],
      commands = [],
      disabled,
      slashTrigger,
      canInsertCommandAtSelection,
      onSelect,
    },
    bind,
  ) {
    const [plusOpen, setPlusOpen] = useState(false);
    const [plusQuery, setPlusQuery] = useState("");
    const [dismissedSlash, setDismissedSlash] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [plusIncludesCommands, setPlusIncludesCommands] = useState(true);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef(false);
    const closingSlashRef = useRef(false);
    const includeCommandsRef = useRef(true);
    const slashSignature = slashTrigger
      ? `${slashTrigger.nodeKey}:${slashTrigger.start}:${slashTrigger.end}:${slashTrigger.query}:${slashTrigger.atStart}`
      : null;
    const slashOpen = Boolean(slashSignature && slashSignature !== dismissedSlash);
    const mode = slashOpen ? "slash" : plusOpen ? "plus" : null;
    const open = mode !== null;
    const query = mode === "slash" ? (slashTrigger?.query ?? "") : plusQuery;
    const includeCommands = mode === "slash" ? Boolean(slashTrigger?.atStart) : plusIncludesCommands;
    const virtualAnchorRef = useRef({
      getBoundingClientRect: () => anchorRef.current?.getBoundingClientRect() ?? new DOMRect(),
    });
    const entries = useMemo(
      () => getReferenceEntries(skills, skillGroups, commands, includeCommands, query),
      [skills, skillGroups, commands, includeCommands, query],
    );

    useEffect(() => {
      if (!slashTrigger) setDismissedSlash(null);
    }, [slashTrigger]);

    useEffect(() => setSelectedIndex(0), [mode, query]);

    useEffect(() => {
      if (!open) return;
      const list = listRef.current;
      const item = list?.querySelector(`#insert-reference-item-${selectedIndex}`);
      if (!list || !item) return;
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
      else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    }, [open, selectedIndex]);

    const selectEntry = (entry: ReferenceEntry) => {
      selectedRef.current = true;
      if (mode === "slash" && slashTrigger) {
        closingSlashRef.current = true;
        setDismissedSlash(slashSignature);
        onSelect(entry, slashTrigger);
      } else {
        setPlusOpen(false);
        onSelect(entry);
      }
    };

    const handleListKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((index) => Math.min(index + 1, Math.max(entries.length - 1, 0)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (entries[selectedIndex]) selectEntry(entries[selectedIndex]);
      } else if (event.key === "Escape" && mode === "slash") {
        event.preventDefault();
        event.stopPropagation();
        closingSlashRef.current = true;
        setDismissedSlash(slashSignature);
      }
    };

    useImperativeHandle(bind, () => ({
      handleSlashKeyDown: (event) => {
        if (mode === "slash") handleListKeyDown(event);
      },
    }));

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) {
            selectedRef.current = false;
            closingSlashRef.current = false;
            setPlusQuery("");
            setSelectedIndex(0);
            setPlusIncludesCommands(includeCommandsRef.current);
            setPlusOpen(true);
          } else if (mode === "slash") {
            closingSlashRef.current = true;
            setDismissedSlash(slashSignature);
          } else {
            setPlusOpen(false);
          }
        }}
      >
        {/* Remount after the composer ref is attached so Radix measures its real position. */}
        <PopoverAnchor key={open ? "open" : "closed"} virtualRef={virtualAnchorRef} />
        <PopoverTrigger asChild>
          <InputGroupButton
            type="button"
            size="icon-sm"
            aria-label="插入命令或技能"
            title="插入命令或技能"
            disabled={disabled || slashOpen}
            className="size-9 shrink-0 cursor-pointer rounded-lg"
            onPointerDown={() => {
              includeCommandsRef.current = canInsertCommandAtSelection();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                includeCommandsRef.current = canInsertCommandAtSelection();
              }
            }}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
          </InputGroupButton>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={includeCommands ? "命令与技能" : "技能"}
          className="max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[min(30rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (mode === "plus") searchRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (selectedRef.current || closingSlashRef.current) event.preventDefault();
            closingSlashRef.current = false;
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
            <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              readOnly={mode === "slash"}
              tabIndex={mode === "slash" ? -1 : undefined}
              onPointerDown={mode === "slash" ? (event) => event.preventDefault() : undefined}
              onChange={(event) => {
                setPlusQuery(event.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleListKeyDown}
              aria-label={includeCommands ? "搜索命令与技能" : "搜索技能"}
              placeholder={mode === "slash" ? "继续输入以搜索" : includeCommands ? "搜索命令与技能" : "搜索技能"}
              className="h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label={includeCommands ? "命令与技能" : "技能"}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <ReferenceOptionsList
              options={entries}
              emptyText={includeCommands ? "没有匹配的已启用命令或技能" : "没有匹配的已启用技能"}
              selectedIndex={selectedIndex}
              selectOption={selectEntry}
              setHighlightedIndex={setSelectedIndex}
              renderOption={(entry) => <ReferenceEntryContent entry={entry} />}
              getGroupLabel={referenceGroupLabel}
              optionIdPrefix="insert-reference-item"
              className="p-1.5 pr-4"
            />
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
