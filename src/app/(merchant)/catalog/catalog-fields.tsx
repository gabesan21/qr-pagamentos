"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Info } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type BannerTone = "info" | "success" | "warning" | "danger";

const bannerIcon: Record<BannerTone, ReactNode> = {
  info: <Info aria-hidden className="mt-0.5 size-4 shrink-0" />,
  success: <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />,
  warning: <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />,
  danger: <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />,
};

export function Banner({
  children,
  className,
  tone,
}: Readonly<{ children: ReactNode; className?: string; tone: BannerTone }>) {
  const variant = tone === "danger" ? "destructive" : tone === "info" ? "default" : tone;
  return (
    <Alert className={className} variant={variant}>
      {bannerIcon[tone]}
      <div className="min-w-0 flex-1">{children}</div>
    </Alert>
  );
}

type BreadcrumbItem = Readonly<{ label: string; href?: string }>;

export function Breadcrumb({ items }: Readonly<{ items: readonly BreadcrumbItem[] }>) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, index) => (
        <span className="flex items-center gap-1.5" key={item.label + index}>
          {index > 0 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
          {item.href ? (
            <a className="hover:text-foreground hover:underline" href={item.href}>
              {item.label}
            </a>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SectionCard({
  children,
  className,
  description,
  id,
  title,
}: Readonly<{
  children: ReactNode;
  className?: string;
  description?: string;
  id?: string;
  title: string;
}>) {
  return (
    <section
      className={cn(
        "scroll-mt-20 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
      id={id}
    >
      <h2 className="font-heading text-lg leading-snug font-medium text-card-foreground">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Dirty-field omission wrapper: the control is unnamed until the merchant
// changes it, so untouched optional fields are not submitted.
export function DirtyNativeSelect({
  defaultValue,
  fieldName,
  onChange,
  ...props
}: Readonly<{
  defaultValue?: string;
  fieldName: string;
} & Omit<ComponentProps<typeof NativeSelect>, "name">>) {
  const [dirty, setDirty] = useState(false);
  return (
    <NativeSelect
      {...props}
      defaultValue={defaultValue}
      name={dirty ? fieldName : undefined}
      onChange={(event) => {
        setDirty(true);
        onChange?.(event);
      }}
    />
  );
}

export function NativeSelectOptions({
  children,
  emptyLabel,
}: Readonly<{ children: ReactNode; emptyLabel: string }>) {
  return (
    <>
      <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>
      {children}
    </>
  );
}
