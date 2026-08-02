import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyIllustration = "orders" | "links" | "products" | "users" | "unavailable";

const illustrationSrc: Record<EmptyIllustration, string> = {
  orders: "/empty-orders.svg",
  links: "/empty-links.svg",
  products: "/empty-products.svg",
  users: "/empty-users.svg",
  unavailable: "/unavailable.svg",
};

/** Empty / filtered-empty / unavailable state with duotone illustration + CTA. */
export function EmptyState({
  illustration = "unavailable",
  title,
  body,
  action,
  className,
}: {
  illustration?: EmptyIllustration;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <img src={illustrationSrc[illustration]} alt="" width={192} height={192} className="mb-4" />
      <h3 className="font-display text-[15px] leading-[22px] font-semibold text-text">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-text-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
