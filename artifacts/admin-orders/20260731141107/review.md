# Administrator global orders directory visual review

- Run: `20260731141107`
- Manifest SHA-256: `03dcbe85d351393bc1be3b525b2902e8e5499844b83413dea804ea0382f06d8c`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only V2 detail with owner attribution, the opaque miss, page 2, payer search, the source filter, and the deleted-owner badge in both locales.
- The directory is read-only: no comment thread, no local-outcome forms, and no mutation surface renders on the administrator detail.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner's orders stay listed with the localized non-color badge and the interim /admin/accounts navigation.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
