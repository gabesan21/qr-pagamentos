"use client";

import { useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Client hints mirror, never replace, the server and media-boundary limits.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type ImageCopy = Readonly<{
  alt: string;
  failed: string;
  failedTitle: string;
  remove: string;
  replace: string;
  upload: string;
  uploading: string;
}>;

type CurrentImage = Readonly<{ identifier: string; staged: boolean }>;

// Focused upload boundary: stages bytes through POST /products/images, keeps
// the opaque identifier in a hidden native field, and previews through the
// existing owner-fenced media read. The surrounding native product form and
// its document POST stay untouched.
export function ProductImageField({
  copy,
  initialIdentifier = null,
  inputId,
  placeholder,
}: Readonly<{
  copy: ImageCopy;
  initialIdentifier?: string | null;
  inputId: string;
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
    // Hint mirror only; the route and media boundary re-validate everything.
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
      const identifier = typeof payload === "object" && payload !== null && "identifier" in payload
        ? (payload as { identifier: unknown }).identifier
        : null;
      if (typeof identifier !== "string" || identifier.length === 0) throw new Error("staging unavailable");
      setCurrent({ identifier, staged: true });
      setRemoved(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div aria-busy={pending || undefined} className="flex flex-col gap-3">
      {current && !removed ? (
        <img alt={copy.alt} className="size-28 rounded-md border border-border object-cover" height={112} src={`/media/${current.identifier}`} width={112} />
      ) : (
        <span className="flex size-28 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">{placeholder}</span>
      )}
      {current?.staged && !removed ? <input name="imageMediaId" type="hidden" value={current.identifier} /> : null}
      {removed ? <input name="imageMediaId" type="hidden" value="" /> : null}
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={copy.replace}
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
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => picker.current?.click()} type="button" variant="outline">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? copy.uploading : current && !removed ? copy.replace : copy.upload}
        </Button>
        {current && !removed ? (
          <Button
            disabled={pending}
            onClick={() => {
              setRemoved(true);
              setFailed(false);
            }}
            type="button"
            variant="outline"
          >
            {copy.remove}
          </Button>
        ) : null}
      </div>
      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>{copy.failedTitle}</AlertTitle>
          <AlertDescription>{copy.failed}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
