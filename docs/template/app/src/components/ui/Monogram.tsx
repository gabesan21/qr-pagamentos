import { cn } from "@/lib/utils";

/** Initials monogram avatar — accent-soft circle fallback (design.md §7). */
export function Monogram({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className={cn("flex items-center justify-center rounded-full bg-accent-soft font-display font-semibold text-text", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials || "?"}
    </div>
  );
}

export function Avatar({
  name,
  imageUrl,
  size = 32,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Monogram name={name} size={size} className={className} />;
}
