type AgentOptionContentProps = {
  label: string;
  category?: string;
  description?: string;
};

export const AgentOptionContent = ({ label, category, description }: AgentOptionContentProps) => (
  <span className="min-w-0 flex-1 space-y-1 text-left">
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {category?.trim() && (
        <span
          className="max-w-24 shrink-0 truncate rounded-md bg-muted/75 px-1.5 py-0.5 text-[10px] leading-4 font-normal text-muted-foreground"
          title={category}
        >
          {category}
        </span>
      )}
    </span>
    <span className="block truncate text-xs leading-4 text-muted-foreground" title={description}>
      {description?.trim() || "暂无简介"}
    </span>
  </span>
);
