# Administrator user directory visual review

- Run: `20260727110719`
- Manifest SHA-256: `e92ff8af0000ae5f4c00dc72e97ba43ba44096d425b98ae24e6180af7a02722e`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the account detail with the profile editor, the opaque miss, page 2, username search, the derived-state filter, and the deleted badge in both locales.
- The directory is read-mostly: edit navigates to `/admin/accounts/[id]`, which renders the account facts plus the profile editor for non-deleted users (identity CAS, role/status/password access, locale, checkout policy, and storefront corrections) and the delivered byte-frozen POST /admin/users/[id]/delete route; deleted accounts render the facts card only with no editor and no delete form.
- Soft-delete runs through the delivered route; the deleted account stays listed and viewable with the localized non-color badge and no actions.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The empty and error directory states are induced only in unit/page tests: the initial administrator always exists, and stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
