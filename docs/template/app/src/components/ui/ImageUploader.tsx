import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** Drag-drop image uploader with staged preview and remove (design.md §7). Mock-only: uses object URLs. */
export function ImageUploader({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const stage = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    onChange(URL.createObjectURL(file));
  };

  if (value) {
    return (
      <div className={cn("relative inline-block", className)}>
        <img src={value} alt="" className="size-32 rounded-card border border-border object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t("common.delete")}
          className="absolute -right-2 -top-2 rounded-full border border-border bg-surface p-1 text-text-2 shadow-card hover:text-danger"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
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
        className,
      )}
    >
      <ImagePlus className="size-6" aria-hidden />
      <span className="px-2 text-center text-xs">{t("common.create")}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => stage(e.target.files?.[0])}
      />
    </button>
  );
}
