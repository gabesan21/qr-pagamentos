import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
} from "@/data-directory/server/notice";
import type { DataDirectoryCopy } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";

import { NoticeToast, type NoticeToastEntry } from "./notice-toast";

type Dictionary = ReturnType<typeof getDictionary>;

// The single generic toolbar/state copy builder every `DataDirectory`
// consumer imports; each concrete directory supplies only its own empty
// title/description. Replaces the seven near-identical per-page
// `directory-copy.ts` files.
export function dataDirectoryCopy(
  dictionary: Dictionary,
  empty: Readonly<{ title: string; description: string }>,
): DataDirectoryCopy {
  return {
    searchLabel: dictionary.dataDirectorySearchLabel,
    searchPlaceholder: dictionary.dataDirectorySearchPlaceholder,
    pageSizeLabel: dictionary.dataDirectoryPageSizeLabel,
    applyFilters: dictionary.dataDirectoryApplyFilters,
    resetFilters: dictionary.dataDirectoryResetFilters,
    clearFilters: dictionary.dataDirectoryClearFilters,
    previousPage: dictionary.dataDirectoryPreviousPage,
    nextPage: dictionary.dataDirectoryNextPage,
    paginationLabel: dictionary.dataDirectoryPaginationLabel,
    loading: dictionary.dataDirectoryLoading,
    loadingDescription: dictionary.dataDirectoryLoadingDescription,
    empty: empty.title,
    emptyDescription: empty.description,
    filteredEmpty: dictionary.dataDirectoryFilteredEmpty,
    filteredEmptyDescription: dictionary.dataDirectoryFilteredEmptyDescription,
    invalid: dictionary.dataDirectoryInvalid,
    invalidDescription: dictionary.dataDirectoryInvalidDescription,
    error: dictionary.dataDirectoryError,
    errorDescription: dictionary.dataDirectoryErrorDescription,
    retry: dictionary.dataDirectoryRetry,
  };
}

// Mounted once by a directory page that resolved a reset redirect carrying
// the reserved `?filters=ignored` pair: raises one informational, echo-free
// toast through the `NoticeToast` bridge, with a `<noscript>` fallback alert
// for the no-JS path. The bridge strips the pair from the URL after firing.
export function DirectoryInvalidFiltersNotice({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const entry: NoticeToastEntry = {
    param: DIRECTORY_INVALID_FILTERS_PARAM,
    value: DIRECTORY_INVALID_FILTERS_VALUE,
    kind: "info",
    message: dictionary.dataDirectoryInvalidFiltersNotice,
  };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Alert role="status" variant="default">
          <AlertTitle>{dictionary.dataDirectoryInvalid}</AlertTitle>
          <AlertDescription>{dictionary.dataDirectoryInvalidFiltersNotice}</AlertDescription>
        </Alert>
      </noscript>
    </>
  );
}
