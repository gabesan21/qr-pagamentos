import type { DataDirectoryCopy } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// Generic toolbar/state copy comes from the role-neutral data-directory
// domain; this directory supplies only its own administrator empty copy.
export function adminOrdersDirectoryCopy(dictionary: Dictionary): DataDirectoryCopy {
  return {
    searchLabel: dictionary.dataDirectorySearchLabel,
    searchPlaceholder: dictionary.dataDirectorySearchPlaceholder,
    pageSizeLabel: dictionary.dataDirectoryPageSizeLabel,
    applyFilters: dictionary.dataDirectoryApplyFilters,
    resetFilters: dictionary.dataDirectoryResetFilters,
    previousPage: dictionary.dataDirectoryPreviousPage,
    nextPage: dictionary.dataDirectoryNextPage,
    paginationLabel: dictionary.dataDirectoryPaginationLabel,
    loading: dictionary.dataDirectoryLoading,
    loadingDescription: dictionary.dataDirectoryLoadingDescription,
    empty: dictionary.adminOrderV2DirectoryEmpty,
    emptyDescription: dictionary.adminOrderV2DirectoryEmptyDescription,
    filteredEmpty: dictionary.dataDirectoryFilteredEmpty,
    filteredEmptyDescription: dictionary.dataDirectoryFilteredEmptyDescription,
    invalid: dictionary.dataDirectoryInvalid,
    invalidDescription: dictionary.dataDirectoryInvalidDescription,
    error: dictionary.dataDirectoryError,
    errorDescription: dictionary.dataDirectoryErrorDescription,
    retry: dictionary.dataDirectoryRetry,
  };
}
