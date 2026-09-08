import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

type Dictionary = ReturnType<typeof getDictionary>;

// These mirror the `noticeKey` each page passes to
// `resolveCatalogDirectoryQuery` (`/catalog?products=<outcome>`,
// `/catalog/categories?categories=<outcome>`) and must stay in sync with it.
const PRODUCT_NOTICE_PARAM = "products";
const CATEGORY_NOTICE_PARAM = "categories";

function Notice({ description, failed, title }: Readonly<{ description: string; failed: boolean; title: string }>) {
  return (
    <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

function productOutcome(dictionary: Dictionary, notice: string): { failed: boolean; description: string } {
  if (notice === "conflict") return { failed: true, description: dictionary.adminProductConflict };
  if (notice === "failed") return { failed: true, description: dictionary.adminProductMutationFailed };
  return { failed: false, description: dictionary.adminProductChanged };
}

export function ProductNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: string }>) {
  const { failed, description } = productOutcome(dictionary, notice);
  const entry: NoticeToastEntry = { param: PRODUCT_NOTICE_PARAM, value: notice, kind: failed ? "error" : "success", message: description };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Notice description={description} failed={failed} title={failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading} />
      </noscript>
    </>
  );
}

function categoryOutcome(dictionary: Dictionary, notice: string): { failed: boolean; description: string } {
  if (notice === "conflict") return { failed: true, description: dictionary.catalogCategoryConflict };
  if (notice === "failed") return { failed: true, description: dictionary.catalogCategoryMutationFailed };
  return { failed: false, description: dictionary.catalogCategoryChanged };
}

export function CategoryNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: string }>) {
  const { failed, description } = categoryOutcome(dictionary, notice);
  const entry: NoticeToastEntry = { param: CATEGORY_NOTICE_PARAM, value: notice, kind: failed ? "error" : "success", message: description };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Notice description={description} failed={failed} title={failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading} />
      </noscript>
    </>
  );
}
