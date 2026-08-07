# Administrator global payment-links directory visual review

- Run: `20260804092417`
- Manifest SHA-256: `624d0498034c0cce5d35bc02bb9734980416f83c69e89bcffbbdbcb79225aae2`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only V2 detail with owner attribution and order drill-down, the opaque miss, page 2, description search, the lifecycle-state filter, and the deleted-owner badge in both locales.
- The directory is read-only: no mutation form, no owner lifecycle or edit affordance renders on the administrator detail; the only navigations are the interim /admin/accounts owner target and the /admin/orders?link=<identifier> drill-down.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner's links stay listed (deactivated by the deletion, so derived inactive) with the localized non-color badge and the interim /admin/accounts navigation.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
