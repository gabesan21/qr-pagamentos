"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, ImagePlus, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
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

export function SegmentedControl({
  ariaLabel,
  disabled,
  onChange,
  options,
  value,
}: Readonly<{
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: readonly Readonly<{ label: string; value: string }>[];
  value: string;
}>) {
  return (
    <div aria-label={ariaLabel} className="inline-flex gap-1 rounded-md bg-muted p-1" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              "rounded px-3 py-1.5 text-label font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50",
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageFieldCopy = Readonly<{
  add: string;
  alt: string;
  failed: string;
  failedTitle: string;
  remove: string;
  replace: string;
  retry: string;
  upload: string;
  uploading: string;
}>;

type CurrentImage = Readonly<{ identifier: string; staged: boolean }>;

export function ImageField({
  copy,
  disabled,
  initialIdentifier,
  inputId,
  onChange,
  placeholder,
}: Readonly<{
  copy: ImageFieldCopy;
  disabled?: boolean;
  initialIdentifier?: string | null;
  inputId: string;
  onChange: (identifier: string | null) => void;
  placeholder: ReactNode;
}>) {
  const [current, setCurrent] = useState<CurrentImage | null>(
    initialIdentifier ? { identifier: initialIdentifier, staged: false } : null,
  );
  const [removed, setRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  async function stage(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]) || file.size > MAX_IMAGE_BYTES) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setPending(true);
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch("/products/images", { method: "POST", body });
      if (!response.ok) throw new Error("staging unavailable");
      const payload: unknown = await response.json();
      const identifier =
        typeof payload === "object" && payload !== null && "identifier" in payload
          ? (payload as { identifier: unknown }).identifier
          : null;
      if (typeof identifier !== "string" || identifier.length === 0) throw new Error("staging unavailable");
      setCurrent({ identifier, staged: true });
      setRemoved(false);
      onChange(identifier);
    } catch {
      setFailed(true);
      onChange(null);
    } finally {
      setPending(false);
    }
  }

  function handleRemove() {
    setRemoved(true);
    setFailed(false);
    onChange(null);
  }

  const showCurrent = current && !removed;

  return (
    <div aria-busy={pending || undefined} className="space-y-3">
      {showCurrent ? (
        <div className="flex items-start gap-3">
          <img
            alt={copy.alt}
            className="size-32 rounded-lg border border-border object-cover"
            height={128}
            src={`/media/${current.identifier}`}
            width={128}
          />
          {!disabled ? (
            <div className="flex flex-col gap-2 pt-1">
              <Button disabled={pending} onClick={() => picker.current?.click()} type="button" variant="outline">
                {copy.replace}
              </Button>
              <Button className="text-destructive" onClick={handleRemove} type="button" variant="ghost">
                {copy.remove}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          className={cn(
            "flex size-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted text-muted-foreground transition-colors",
            (disabled || pending) && "opacity-50",
          )}
          disabled={disabled || pending}
          onClick={() => picker.current?.click()}
          type="button"
        >
          {pending ? <Spinner aria-hidden className="size-6" /> : <ImagePlus aria-hidden className="size-6" />}
          <span className="px-2 text-center text-xs">{pending ? copy.uploading : copy.add}</span>
        </button>
      )}
      {failed ? (
        <Banner tone="danger">
          <div className="flex items-center justify-between gap-3">
            <span>{copy.failed}</span>
            <Button onClick={() => picker.current?.click()} type="button" variant="ghost">
              {copy.retry}
            </Button>
          </div>
        </Banner>
      ) : null}
      <input
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        id={inputId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void stage(file);
          event.target.value = "";
        }}
        ref={picker}
        tabIndex={-1}
        type="file"
      />
    </div>
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
