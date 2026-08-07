"use client";

import { useRef, useState } from "react";

import type { OwnerProductCategory } from "@/auth/product-category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { getDictionary } from "@/i18n/dictionaries";

import { Banner } from "../catalog-fields";

type Dictionary = ReturnType<typeof getDictionary>;

export function CategoryRowActions({
  activeReplacements,
  category,
  dictionary,
  references,
}: Readonly<{
  activeReplacements: readonly OwnerProductCategory[];
  category: OwnerProductCategory;
  dictionary: Dictionary;
  references: number;
}>) {
  const [editing, setEditing] = useState(false);
  const [namePtBr, setNamePtBr] = useState(category.namePtBr);
  const [nameEn, setNameEn] = useState(category.nameEn);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replacement, setReplacement] = useState(activeReplacements[0]?.id ?? "");
  const editFormRef = useRef<HTMLFormElement>(null);

  const editFormId = `category-${category.id}-edit`;
  const deactivateFormId = `category-${category.id}-deactivate`;

  function handleCancel() {
    setEditing(false);
    setNamePtBr(category.namePtBr);
    setNameEn(category.nameEn);
  }

  const blocked = references > 0 && activeReplacements.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        action="/product-categories"
        className="flex w-full flex-col gap-3"
        hidden={!editing}
        id={editFormId}
        method="post"
        ref={editFormRef}
      >
        <input name="action" type="hidden" value="edit" />
        <input name="id" type="hidden" value={category.id} />
        <input name="version" type="hidden" value={category.version} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
            name="namePtBr"
            onChange={(event) => setNamePtBr(event.target.value)}
            required
            value={namePtBr}
          />
          <input
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
            name="nameEn"
            onChange={(event) => setNameEn(event.target.value)}
            required
            value={nameEn}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" type="submit">
            {dictionary.catalogCategorySave}
          </Button>
          <Button onClick={handleCancel} size="sm" type="button" variant="ghost">
            {dictionary.cancel}
          </Button>
        </div>
      </form>

      {!editing ? (
        <>
          <Button onClick={() => setEditing(true)} size="sm" variant="secondary">
            {dictionary.catalogCategoryEdit}
          </Button>
          {blocked ? (
            <Banner className="w-full" tone="warning">
              {dictionary.catalogCategoryDeactivateNoReplacement}
            </Banner>
          ) : (
            <>
              <Button className="text-destructive" onClick={() => setDialogOpen(true)} size="sm" type="button" variant="ghost">
                {dictionary.catalogCategoryDeactivateHeading}
              </Button>
              <form action="/product-categories" className="sr-only" id={deactivateFormId} method="post">
                <input name="action" type="hidden" value="deactivate" />
                <input name="id" type="hidden" value={category.id} />
                <input name="version" type="hidden" value={category.version} />
                {references > 0 ? (
                  <input name="replacementId" type="hidden" value={replacement} />
                ) : null}
              </form>
            </>
          )}
        </>
      ) : null}

      {references === 0 ? (
        <ConfirmDialog
          cancelLabel={dictionary.cancel}
          confirmLabel={dictionary.catalogCategoryDeactivate}
          description={dictionary.catalogCategoryDeactivateDescription}
          destructive
          failureMessage={dictionary.catalogCategoryMutationFailed}
          onConfirm={() => {
            const form = document.getElementById(deactivateFormId);
            if (form instanceof HTMLFormElement) form.requestSubmit();
          }}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          pendingLabel={dictionary.loading}
          title={dictionary.catalogCategoryDeactivateConfirm}
        />
      ) : (
        <Modal
          closeLabel={dictionary.dataDirectoryResetFilters}
          footer={
            <>
              <Button onClick={() => setDialogOpen(false)} type="button" variant="ghost">
                {dictionary.cancel}
              </Button>
              <Button
                disabled={activeReplacements.length === 0 || !replacement}
                onClick={() => {
                  const form = document.getElementById(deactivateFormId);
                  if (form instanceof HTMLFormElement) form.requestSubmit();
                }}
                type="button"
                variant="destructive"
              >
                {dictionary.catalogCategoryDeactivate}
              </Button>
            </>
          }
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          title={dictionary.catalogCategoryDeactivateConfirm}
        >
          <div className="space-y-3 text-sm">
            <p>
              {dictionary.catalogCategoryDeactivateDescription}
            </p>
            {activeReplacements.length > 0 ? (
              <div>
                <label className="text-sm font-medium" htmlFor={`${deactivateFormId}-replacement`}>
                  {dictionary.catalogCategoryDeactivateReplacement}
                </label>
                <NativeSelect
                  className="mt-1.5"
                  id={`${deactivateFormId}-replacement`}
                  onChange={(event) => setReplacement(event.target.value)}
                  value={replacement}
                >
                  <NativeSelectOption disabled value="">
                    {dictionary.catalogCategoryDeactivateReplacementRequired}
                  </NativeSelectOption>
                  {activeReplacements.map((replacementCategory) => (
                    <NativeSelectOption key={replacementCategory.id} value={replacementCategory.id}>
                      {replacementCategory.namePtBr} / {replacementCategory.nameEn}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <Banner tone="warning">{dictionary.catalogCategoryDeactivateNoReplacement}</Banner>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
