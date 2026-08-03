import Image from "next/image";

import { cn } from "@/lib/utils";

export type MonogramSize = "default" | "lg" | "sm";

const sizeClasses: Readonly<Record<MonogramSize, string>> = {
  default: "size-8 text-sm",
  lg: "size-10 text-sm",
  sm: "size-6 text-xs",
};

const sizePixels: Readonly<Record<MonogramSize, number>> = {
  default: 32,
  lg: 40,
  sm: 24,
};

function initialsFor(name: string) {
  const segments = name.trim().split(/[\s-]+/u).filter(Boolean).slice(0, 2);
  const initials = segments.map((segment) => Array.from(segment)[0]?.toUpperCase()).join("");
  return initials || "?";
}

type MonogramProps = Readonly<{
  accessibleName?: string;
  className?: string;
  imageUrl?: string | null;
  name: string;
  size?: MonogramSize;
}>;

export function Monogram({ accessibleName, className, imageUrl, name, size = "default" }: MonogramProps) {
  return (
    <span
      aria-hidden={accessibleName ? undefined : true}
      aria-label={accessibleName}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-heading font-semibold text-muted-foreground ring-1 ring-border",
        sizeClasses[size],
        className,
      )}
      role={accessibleName ? "img" : undefined}
    >
      <span>{initialsFor(name)}</span>
      {imageUrl ? (
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={sizePixels[size]}
          src={imageUrl}
          width={sizePixels[size]}
        />
      ) : null}
    </span>
  );
}
