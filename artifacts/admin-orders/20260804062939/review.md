# Administrator global orders directory visual review

- Run: `20260804062939`
- Manifest SHA-256: `e2cdce2a0652bd679f09a62f0475c121adc8a3d15a107ae9d540fec978f8a5a7`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only V2 detail with owner attribution, the opaque miss, page 2, payer search, the source filter, and the deleted-owner badge in both locales.
- The directory is read-only: no comment thread, no local-outcome forms, and no mutation surface renders on the administrator detail.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner's orders stay listed with the localized non-color badge and the interim /admin/accounts navigation.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
