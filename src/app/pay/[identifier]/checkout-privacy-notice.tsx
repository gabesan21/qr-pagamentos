"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// Small privacy client boundary shared by the shell's footer link and F03's
// buyer form (mounted under the submit): a short line plus a trigger that
// opens the expanded notice in `Modal`, both sourced from dictionary keys —
// no static sentence and no duplicated markup between call sites.
export function CheckoutPrivacyNotice({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-center text-xs text-text-2">
        {dictionary.checkoutPrivacyLine}{" "}
        <button className="inline-flex min-h-11 min-w-11 items-center justify-center underline underline-offset-2 hover:text-text" onClick={() => setOpen(true)} type="button">
          {dictionary.checkoutPrivacyLinkLabel}
        </button>
      </p>
      <Modal closeLabel={dictionary.close} onOpenChange={setOpen} open={open} size="md" title={dictionary.checkoutPrivacyModalTitle}>
        {dictionary.checkoutPrivacyModalBody.split("\n\n").map((paragraph) => (
          <p className="mb-3 text-sm leading-6 text-text-2 last:mb-0" key={paragraph}>{paragraph}</p>
        ))}
      </Modal>
    </>
  );
}
