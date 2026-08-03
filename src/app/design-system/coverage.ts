export type SpecimenCoverageEntry = Readonly<{
  id: string;
  owner: string;
  publicApi: string;
  fixture: string;
  states: readonly string[];
  bindings: readonly SpecimenStateBinding[];
  notApplicable: readonly string[];
}>;

export type SpecimenStateBinding = Readonly<{
  id: string;
  selector: string;
  state: string;
}>;

export const specimenBindingId = (owner: string, state: string) => `ds-${owner}-${state}`;

// This is executable F01 input. F02 derives assertions from it and rejects a
// missing, duplicate, stale, or otherwise unrepresented inventory owner.
const ownerPath = (id: string) => id === "data-directory-table" || id === "data-directory-filter"
  ? "src/data-directory/ui/data-directory.tsx"
  : `src/components/ui/${id}.tsx`;

type CoverageSeed = readonly [string, string, string, readonly string[], readonly string[]];

const coverageSeeds: readonly CoverageSeed[] = [
  ["button", "Button", "actions", ["default", "hover", "focus", "loading", "disabled"], ["empty", "error"]],
  ["checkbox", "Checkbox", "controls", ["default", "checked", "focus", "invalid", "disabled"], ["loading", "empty", "error"]],
  ["input-otp", "InputOTP", "controls", ["default", "populated", "active", "focus", "invalid", "disabled"], ["loading", "empty", "error"]],
  ["switch", "Switch", "controls", ["default", "checked", "hover", "focus", "disabled"], ["loading", "empty", "error"]],
  ["copy-field", "CopyField", "copy", ["ready", "pending", "copied", "failed", "focus", "disabled"], ["empty"]],
  ["data-directory-table", "DataDirectory", "directory", ["ready", "loading", "empty", "filtered-empty", "invalid-query", "error"], ["client-sort", "total-count"]],
  ["empty-state", "EmptyState", "empty-states", ["empty", "filtered-empty", "unavailable", "error", "recovery-focus"], ["loading", "disabled"]],
  ["data-directory-filter", "DataDirectory", "directory", ["default", "populated", "focus", "selected", "reset", "disabled"], ["client-filter", "loading"]],
  ["localized-field-group", "LocalizedFieldGroup", "controls", ["default", "populated", "selected", "invalid", "focus", "disabled"], ["loading", "empty", "error"]],
  ["modal", "Modal, ConfirmDialog", "overlays", ["closed", "open", "focus-loop", "confirmation", "pending", "failed", "disabled", "focus-restored"], ["empty"]],
  ["money-text", "MoneyText", "display", ["ready"], ["loading", "empty", "error", "hover", "focus", "disabled"]],
  ["monogram", "Monogram", "display", ["image", "fallback", "accessible", "decorative"], ["loading", "empty", "error", "hover", "focus", "disabled"]],
  ["qr-display", "QrDisplay", "display", ["preparing", "available", "waiting", "recovery", "terminal"], ["hover", "focus", "disabled"]],
  ["simple-tabs", "SimpleTabs", "controls", ["default", "selected", "hover", "focus", "disabled"], ["loading", "empty", "error"]],
  ["skeletons", "CardSkeleton, StatGridSkeleton, TableSkeleton, DetailSkeleton, CheckoutSkeleton", "loading", ["loading"], ["default", "empty", "error", "hover", "focus", "disabled"]],
  ["stat-card", "StatCard", "display", ["ready", "empty", "unavailable"], ["loading", "error", "hover", "focus", "disabled"]],
  ["status-badge", "StatusBadge", "display", ["ready", "archived", "success", "warning", "danger", "info", "neutral"], ["loading", "empty", "error", "hover", "focus", "disabled"]],
  ["timeline", "Timeline", "display", ["ready", "empty", "default", "success", "info", "danger"], ["loading", "error", "hover", "focus", "disabled"]],
  ["toast", "showToast, ToastViewport", "feedback", ["info", "success", "warning", "error", "dismiss", "retry"], ["loading", "empty", "hover", "focus", "disabled"]],
  ["pagination", "Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext", "directory", ["default", "previous", "next", "focus", "disabled"], ["loading", "empty", "error", "total-count", "page-number"]],
];

export const designSystemCoverage: readonly SpecimenCoverageEntry[] = coverageSeeds.map(([id, publicApi, fixture, states, notApplicable]) => ({
  id,
  owner: ownerPath(id),
  publicApi,
  fixture,
  states,
  bindings: states.map((state) => ({ id: specimenBindingId(id, state), selector: `#${specimenBindingId(id, state)}`, state })),
  notApplicable,
}));

export const primitiveCoverage = [
  "Alert", "AlertDialog", "Avatar", "Badge", "Button", "Card", "Checkbox", "Dialog", "Empty", "Field", "Input", "InputOTP", "Label", "NativeSelect", "Pagination", "Separator", "Skeleton", "Sonner", "Spinner", "Switch", "Table", "Tabs", "Textarea",
] as const;

export const primitiveBindingId = (primitive: typeof primitiveCoverage[number]) => `ds-primitive-${primitive.toLowerCase()}`;
