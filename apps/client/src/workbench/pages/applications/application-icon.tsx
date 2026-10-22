import { Blocks } from "lucide-react";
import { useEffect, useState } from "react";
import { getApplicationIcon } from "@/api/applications";
import { cn } from "design-system/lib/utils";

type ApplicationIconProps = {
  application: { id: string; icon?: string | null; version: string };
  className?: string;
  iconClassName?: string;
};

export const ApplicationIcon = ({ application, className, iconClassName }: ApplicationIconProps) => {
  const { id, icon, version } = application;
  const key = JSON.stringify([id, icon, version]);
  const [image, setImage] = useState<{ key: string; src: string | null } | null>(null);
  const src = image?.key === key ? image.src : null;

  useEffect(() => {
    if (!icon) return;
    let active = true;
    void getApplicationIcon(id).then(
      (value) => {
        if (active) setImage({ key, src: value });
      },
      () => {
        if (active) setImage({ key, src: null });
      },
    );
    return () => {
      active = false;
    };
  }, [id, icon, version, key]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-primary",
        !src && "bg-accent",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          draggable={false}
          onError={() => setImage({ key, src: null })}
        />
      ) : (
        <Blocks className={cn("size-5", iconClassName)} />
      )}
    </span>
  );
};
