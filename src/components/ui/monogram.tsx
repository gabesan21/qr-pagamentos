import Image from "next/image";

import { cn } from "@/lib/utils";

export type MonogramSize = "default" | "lg" | "sm" | "xl";

const sizeClasses: Readonly<Record<MonogramSize, string>> = {
  default: "size-8 text-sm",
  lg: "size-10 text-sm",
  sm: "size-6 text-xs",
  xl: "size-12 text-base",
};

const sizePixels: Readonly<Record<MonogramSize, number>> = {
  default: 32,
  lg: 40,
  sm: 24,
  xl: 48,
};

// `xl` is the template's accent-soft avatar surface (design.md §7); the smaller,
// pre-existing sizes keep their muted fallback so no current call site's look changes.
const surfaceClasses: Readonly<Record<MonogramSize, string>> = {
  default: "bg-muted text-muted-foreground",
  lg: "bg-muted text-muted-foreground",
  sm: "bg-muted text-muted-foreground",
  xl: "bg-accent-soft text-text",
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
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-heading font-semibold ring-1 ring-border",
        sizeClasses[size],
        surfaceClasses[size],
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
