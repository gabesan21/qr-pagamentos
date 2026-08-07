import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, ChevronRight, ImagePlus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

/* Shared form primitives for the catalog/settings/profile pages (token-styled). */

export const inputCls = cn(
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3",
  "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
  "disabled:cursor-not-allowed disabled:bg-surface-2",
);

export function Field({
  label,
  htmlFor,
  error,
  helper,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  helper?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-text-3">({t("catalog.form.optional")})</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p className="mt-1.5 text-xs text-text-3">{helper}</p>
      ) : null}
    </div>
  );
}

export function NativeSelect({
  id,
  value,
  onChange,
  options,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, "appearance-none pr-8", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SegmentedControl({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex gap-1 rounded-md bg-surface-2 p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
              selected ? "bg-surface text-text shadow-card" : "text-text-3 hover:text-text-2",
              disabled && "opacity-50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export type BannerTone = "info" | "success" | "warning" | "danger";

const bannerTones: Record<BannerTone, string> = {
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export function Banner({ tone, children, className }: { tone: BannerTone; children: ReactNode; className?: string }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className={cn("flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 text-sm", bannerTones[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  );
}

export function SectionCard({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className={cn("scroll-mt-20 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6", className)}
    >
      <h2 className="font-display text-lg leading-[26px] font-semibold text-text">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-2">{description}</p>}
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-text-3">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {item.to ? (
            <a href={item.to} className="hover:text-text hover:underline">
              {item.label}
            </a>
          ) : (
            <span className="text-text">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Image staging field with replace/remove and simulated staging failure.
 * Mock rule: files whose name contains "fail" fail staging; retry re-stages the same file.
 */
export function ImageField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const [failed, setFailed] = useState(false);
  const [staging, setStaging] = useState(false);
  const [dragging, setDragging] = useState(false);

  const stage = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    lastFile.current = file;
    setStaging(true);
    setFailed(false);
    // Simulated async staging
    setTimeout(() => {
      setStaging(false);
      if (file.name.toLowerCase().includes("fail")) {
        setFailed(true);
        onChange(null);
      } else {
        onChange(URL.createObjectURL(file));
      }
    }, 500);
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start gap-3">
          <img src={value} alt="" className="size-32 rounded-card border border-border object-cover" />
          {!disabled && (
            <div className="flex flex-col gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                {t("catalog.upload.replace")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => onChange(null)}>
                {t("catalog.upload.remove")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || staging}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            stage(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex size-32 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2 text-text-3 transition-colors",
            dragging && "border-accent bg-accent-soft text-accent",
            (disabled || staging) && "opacity-50",
          )}
        >
          <ImagePlus className="size-6" aria-hidden />
          <span className="px-2 text-center text-xs">{staging ? t("common.loading") : t("catalog.upload.add")}</span>
        </button>
      )}
      {failed && (
        <Banner tone="danger">
          <div className="flex items-center justify-between gap-3">
            <span>{t("catalog.upload.failed")}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => stage(lastFile.current)}>
              {t("common.retry")}
            </Button>
          </div>
        </Banner>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          stage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
