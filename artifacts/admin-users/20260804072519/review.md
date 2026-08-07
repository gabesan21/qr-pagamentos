# Administrator user directory visual review

- Run: `20260804072519`
- Manifest SHA-256: `ada1fb0816903d4813bd074d8e6eb8f020bb8846d2eaef1e428dbe6f7d843a7d`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the account detail with the profile editor, the opaque miss, page 2, username search, the derived-state filter, and the deleted badge in both locales.
- The directory is read-mostly: edit navigates to `/admin/accounts/[id]`, which renders the account facts plus the profile editor for non-deleted users (identity CAS, role/status/password access, locale, checkout policy, and storefront corrections), the delivered password-reset request card, and the delivered byte-frozen POST /admin/users/[id]/delete route; deleted accounts render the facts card only with no editor and no delete form.
- Soft-delete runs through the delivered route; the deleted account stays listed and viewable with the localized non-color badge and no actions.
- The password-reset request card posts `/admin/users/[id]/reset-password`; success and error notices are both accessible and carry no internal identity.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The empty and error directory states are induced only in unit/page tests: the initial administrator always exists, and stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
