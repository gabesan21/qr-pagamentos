# Merchant payment-link directory visual review

- Run: `20260731140656`
- Manifest SHA-256: `ed6322082c63adfb7ae5cfdb6bd460f3121e009eeff8af9e3eecf71e0426a64e`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twenty localized state captures including 320-pixel reflow, detail, opaque miss, page 2, the create/edit forms, every closed outcome notice, and the read-only order drilldown (list, detail, opaque mismatch).
- Management flows run through the real 8.2.2 UI: both composition kinds create, expiry-only edit succeeds under a seeded checkout attempt (dirty omission), a financial edit on the same link fails opaquely, an explicit blank clears expiry, and activate/deactivate land on their notices.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
