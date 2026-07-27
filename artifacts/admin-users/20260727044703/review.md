# Administrator user directory visual review

- Run: `20260727044703`
- Manifest SHA-256: `b3a8c673e7bc6734257f4bc7df121550cf787d3db553893809d90f26195e6ca4`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only account detail, the opaque miss, page 2, username search, the derived-state filter, and the deleted badge in both locales.
- The directory is read-mostly: edit navigates to the read-only detail and delete posts the delivered byte-frozen POST /admin/users/[id]/delete route; no legacy role, status, or password form renders anywhere on the accounts surface.
- Soft-delete runs through the delivered route; the deleted account stays listed and viewable with the localized non-color badge and no actions.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The empty and error directory states are induced only in unit/page tests: the initial administrator always exists, and stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
