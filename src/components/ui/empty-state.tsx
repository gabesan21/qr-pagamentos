import Image from "next/image";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type EmptyStateIllustration =
  | "links"
  | "orders"
  | "products"
  | "unavailable"
  | "users";

export type EmptyStateKind = "empty" | "error" | "filtered-empty" | "unavailable";

const illustrationSources: Readonly<Record<EmptyStateIllustration, string>> = {
  links: "/application-assets/empty-links.svg",
  orders: "/application-assets/empty-orders.svg",
  products: "/application-assets/empty-products.svg",
  unavailable: "/application-assets/unavailable.svg",
  users: "/application-assets/empty-users.svg",
};

type EmptyStateProps = Readonly<{
  action?: ReactNode;
  body?: string;
  className?: string;
  illustration?: EmptyStateIllustration;
  kind?: EmptyStateKind;
  title: string;
}>;

export function EmptyState({
  action,
  body,
  className,
  illustration = "unavailable",
  kind = "empty",
  title,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn("py-12", className)}
      data-state={kind}
      role={kind === "error" ? "alert" : "status"}
    >
      <EmptyHeader>
        <EmptyMedia>
          <Image alt="" aria-hidden height={192} src={illustrationSources[illustration]} width={192} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {body ? <EmptyDescription>{body}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
