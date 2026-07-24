import { Badge } from "@/components/ui/badge";

import { DataDirectory, type DataDirectoryCopy, type DataDirectoryState } from "./data-directory";

type SpecimenDictionary = Readonly<Record<
  | "dataDirectorySearchLabel"
  | "dataDirectorySearchPlaceholder"
  | "dataDirectoryStatusLabel"
  | "dataDirectoryAllStatuses"
  | "dataDirectoryPageSizeLabel"
  | "dataDirectoryApplyFilters"
  | "dataDirectoryResetFilters"
  | "dataDirectoryPreviousPage"
  | "dataDirectoryNextPage"
  | "dataDirectoryPaginationLabel"
  | "dataDirectoryTableCaption"
  | "dataDirectoryReferenceColumn"
  | "dataDirectoryLabelColumn"
  | "dataDirectoryAmountColumn"
  | "dataDirectoryStatusColumn"
  | "dataDirectoryActiveStatus"
  | "dataDirectoryReviewStatus"
  | "dataDirectoryLoading"
  | "dataDirectoryLoadingDescription"
  | "dataDirectoryEmpty"
  | "dataDirectoryEmptyDescription"
  | "dataDirectoryFilteredEmpty"
  | "dataDirectoryFilteredEmptyDescription"
  | "dataDirectoryInvalid"
  | "dataDirectoryInvalidDescription"
  | "dataDirectoryError"
  | "dataDirectoryErrorDescription"
  | "dataDirectoryRetry"
  | "dataDirectoryCreateExample"
  | "dataDirectoryReadyState"
  | "dataDirectoryLoadingState"
  | "dataDirectoryEmptyState"
  | "dataDirectoryFilteredEmptyState"
  | "dataDirectoryInvalidState"
  | "dataDirectoryErrorState",
  string
>>;

const states: readonly DataDirectoryState[] = [
  "ready",
  "loading",
  "empty",
  "filtered-empty",
  "invalid-query",
  "error",
];

export function DataDirectorySpecimen({ dictionary }: Readonly<{ dictionary: SpecimenDictionary }>) {
  const copy: DataDirectoryCopy = {
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
    empty: dictionary.dataDirectoryEmpty,
    emptyDescription: dictionary.dataDirectoryEmptyDescription,
    filteredEmpty: dictionary.dataDirectoryFilteredEmpty,
    filteredEmptyDescription: dictionary.dataDirectoryFilteredEmptyDescription,
    invalid: dictionary.dataDirectoryInvalid,
    invalidDescription: dictionary.dataDirectoryInvalidDescription,
    error: dictionary.dataDirectoryError,
    errorDescription: dictionary.dataDirectoryErrorDescription,
    retry: dictionary.dataDirectoryRetry,
  };
  const stateLabels: Record<DataDirectoryState, string> = {
    ready: dictionary.dataDirectoryReadyState,
    loading: dictionary.dataDirectoryLoadingState,
    empty: dictionary.dataDirectoryEmptyState,
    "filtered-empty": dictionary.dataDirectoryFilteredEmptyState,
    "invalid-query": dictionary.dataDirectoryInvalidState,
    error: dictionary.dataDirectoryErrorState,
  };
  const rows = [
    { id: "SYN-001", label: "PIX Alpha", amount: "128,40", status: dictionary.dataDirectoryActiveStatus },
    { id: "SYN-002", label: "PIX Beta", amount: "72,00", status: dictionary.dataDirectoryReviewStatus },
  ];
  const columns = [
    { id: "reference", label: dictionary.dataDirectoryReferenceColumn, value: (row: typeof rows[number]) => row.id },
    { id: "label", label: dictionary.dataDirectoryLabelColumn, value: (row: typeof rows[number]) => row.label },
    { id: "amount", label: dictionary.dataDirectoryAmountColumn, value: (row: typeof rows[number]) => row.amount, numeric: true },
    { id: "status", label: dictionary.dataDirectoryStatusColumn, value: (row: typeof rows[number]) => <Badge variant="outline">{row.status}</Badge> },
  ];

  return (
    <div className="grid gap-8">
      {states.map((state) => (
        <section aria-labelledby={`directory-${state}-heading`} className="grid gap-5" data-directory-specimen-state={state} data-ds-section={`directory-${state}`} key={state}>
          <h3 id={`directory-${state}-heading`}>{stateLabels[state]}</h3>
          <DataDirectory
            caption={dictionary.dataDirectoryTableCaption}
            columns={columns}
            copy={copy}
            emptyAction={{ href: "/design-system", label: dictionary.dataDirectoryCreateExample }}
            filters={[{
              name: "status",
              label: dictionary.dataDirectoryStatusLabel,
              allLabel: dictionary.dataDirectoryAllStatuses,
              options: [
                { value: "ACTIVE", label: dictionary.dataDirectoryActiveStatus },
                { value: "REVIEW", label: dictionary.dataDirectoryReviewStatus },
              ],
            }]}
            formAction="/design-system"
            idPrefix={`specimen-directory-${state}`}
            nextUrl="/design-system?pageSize=25&cursor=synthetic-next"
            previousUrl={state === "ready" ? "/design-system?pageSize=25&cursor=synthetic-previous" : undefined}
            resetUrl="/design-system"
            retryUrl="/design-system"
            rowKey={(row) => row.id}
            rows={rows}
            state={state}
          />
        </section>
      ))}
    </div>
  );
}
