import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Slot } from "radix-ui";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const hasContent = (value: ReactNode) =>
  value != null && typeof value !== "boolean" && value !== "";

export function PageHeaderTitle({
  as: Heading = "h2",
  asChild = false,
  className,
  ...props
}: ComponentProps<"h2"> & { as?: "h1" | "h2"; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : Heading;
  return (
    <Comp
      {...props}
      data-slot="page-header-title"
      className={cn(
        "min-w-0 text-[length:var(--page-header-title-size)] leading-[var(--page-header-title-leading)] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]",
        className,
      )}
    />
  );
}

export function PageHeaderDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      {...props}
      data-slot="page-header-description"
      className={cn(
        "mt-[var(--page-header-description-gap)] text-[length:var(--page-header-description-size)] leading-5 text-muted-foreground [overflow-wrap:anywhere]",
        className,
      )}
    />
  );
}

export type PageHeaderProps = Omit<
  ComponentProps<"header">,
  "title" | "content"
> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  titleAction?: ReactNode;
  actions?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** Only the surface changes; typography, padding, and controls stay identical. */
  variant?: "plain" | "bordered" | "soft";
  titleAs?: "h1" | "h2";
  /** Optional tabs, search, or filters below the standard title row. */
  toolbar?: ReactNode;
  /** Escape hatches for bespoke consumers; regular host pages use the standard slots. */
  leading?: ReactNode;
  content?: ReactNode;
};

/** One typography, spacing, icon, and back-button style; callers supply content and callbacks. */
export function PageHeader({
  title,
  description,
  icon,
  titleAction,
  actions,
  onBack,
  showBack = Boolean(onBack),
  backLabel = "返回",
  backDisabled = false,
  variant = "bordered",
  titleAs = "h2",
  toolbar,
  leading,
  content,
  children,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      {...props}
      data-slot="page-header"
      data-variant={variant}
      className={cn(
        "@container/page-header shrink-0 text-foreground",
        variant === "plain" && "bg-transparent",
        variant === "bordered" && "border-b border-border/70 bg-transparent",
        variant === "soft" && "border-b border-border/70 bg-card/50",
        className,
      )}
    >
      {hasContent(content) ? (
        content
      ) : hasContent(children) ? (
        children
      ) : (
        <>
          <div
            data-slot="page-header-row"
            className="flex min-h-[var(--page-header-height)] flex-wrap items-center gap-x-6 gap-y-3 px-[var(--page-header-padding-x)] py-[var(--page-header-padding-y)] @max-lg/page-header:px-4"
          >
            <div
              data-slot="page-header-identity"
              className="flex min-w-0 flex-1 basis-64 items-center gap-[var(--page-header-gap)]"
            >
              {showBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-slot="page-header-back"
                  aria-label={backLabel}
                  title={backLabel}
                  disabled={backDisabled || !onBack}
                  onClick={onBack}
                  className="shrink-0 text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </Button>
              )}
              {hasContent(leading) ? (
                leading
              ) : (
                <>
                  {hasContent(icon) && (
                    <span
                      data-slot="page-header-icon"
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:size-5"
                    >
                      {icon}
                    </span>
                  )}
                  {(hasContent(title) ||
                    hasContent(description) ||
                    hasContent(titleAction)) && (
                    <div className="min-w-0 flex-1">
                      {(hasContent(title) || hasContent(titleAction)) && (
                        <div className="flex min-w-0 flex-wrap items-center gap-[var(--page-header-inline-gap)]">
                          {hasContent(title) && (
                            <PageHeaderTitle as={titleAs}>
                              {title}
                            </PageHeaderTitle>
                          )}
                          {titleAction}
                        </div>
                      )}
                      {hasContent(description) && (
                        <PageHeaderDescription>
                          {description}
                        </PageHeaderDescription>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {hasContent(actions) && (
              <div
                data-slot="page-header-actions"
                className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-[var(--page-header-inline-gap)] [&_button]:pointer-coarse:min-h-11 [&_button]:pointer-coarse:min-w-11 [&_a]:pointer-coarse:min-h-11 [&_a]:pointer-coarse:min-w-11"
              >
                {actions}
              </div>
            )}
          </div>
          {hasContent(toolbar) && (
            <div
              data-slot="page-header-toolbar"
              className="min-w-0 px-[var(--page-header-padding-x)] pb-3 @max-lg/page-header:px-4"
            >
              {toolbar}
            </div>
          )}
        </>
      )}
    </header>
  );
}
