"use client";

import { useEffect } from "react";

// Session-scoped draft persistence for arbitrary merchant forms: a native
// document POST navigates away on every submit, so the typed values would
// otherwise be lost whenever the server redirects back with a failure
// notice. Each form keeps at most one entry, written at submit time and
// read back only when the current URL carries the closed failure notice; a
// load without that notice clears the entry so a later clean visit never
// sees stale values. Keyed by an arbitrary form id/scope chosen by the
// caller — never a form field name — so unrelated forms never collide.
const STORAGE_PREFIX = "qr-form-draft:";

export function saveFormDraft(key: string, values: Readonly<Record<string, string>>): void {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(values));
  } catch {
    // Best-effort only: private browsing may refuse storage.
  }
}

export function readFormDraft(key: string): Record<string, string> | null {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // Best-effort only.
  }
}

export function hasFailureNotice(noticeKey: string, noticeValues: readonly string[]): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get(noticeKey);
  return value !== null && noticeValues.includes(value);
}

// Fields whose value can be captured as plain text: excludes file/password
// inputs (never worth persisting to sessionStorage) and checkbox/radio
// inputs (their meaningful state is `checked`, not `value`).
type DraftableField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isDraftableField(field: Element | RadioNodeList | null): field is DraftableField {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) return true;
  if (field instanceof HTMLInputElement) {
    return !["file", "password", "checkbox", "radio"].includes(field.type);
  }
  return false;
}

// Draft guard for a server-rendered, uncontrolled native form: it never
// reads or intercepts the submit event's default action, only observes it.
export function FormDraftGuard({
  draftKey,
  fieldNames,
  formId,
  noticeKey,
  noticeValues,
}: Readonly<{
  draftKey: string;
  fieldNames: readonly string[];
  formId: string;
  noticeKey: string;
  noticeValues: readonly string[];
}>) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    if (hasFailureNotice(noticeKey, noticeValues)) {
      const draft = readFormDraft(draftKey);
      if (draft) {
        for (const name of fieldNames) {
          const field = form.elements.namedItem(name);
          if (isDraftableField(field) && typeof draft[name] === "string") field.value = draft[name];
        }
      }
    } else {
      clearFormDraft(draftKey);
    }

    const observeSubmit = () => {
      const values: Record<string, string> = {};
      for (const name of fieldNames) {
        const field = form.elements.namedItem(name);
        if (isDraftableField(field)) values[name] = field.value;
      }
      saveFormDraft(draftKey, values);
    };
    form.addEventListener("submit", observeSubmit);
    return () => form.removeEventListener("submit", observeSubmit);
  }, [draftKey, fieldNames, formId, noticeKey, noticeValues]);

  return null;
}
