"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
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
        <Button onClick={() => setOpen(true)} size="inline" type="button" variant="link">
          {dictionary.checkoutPrivacyLinkLabel}
        </Button>
      </p>
      <Modal closeLabel={dictionary.close} onOpenChange={setOpen} open={open} size="md" title={dictionary.checkoutPrivacyModalTitle}>
        {dictionary.checkoutPrivacyModalBody.split("\n\n").map((paragraph) => (
          <p className="mb-3 text-sm leading-6 text-text-2 last:mb-0" key={paragraph}>{paragraph}</p>
        ))}
      </Modal>
    </>
  );
}
