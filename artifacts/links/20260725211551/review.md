# Merchant payment-link directory visual review

- Run: `20260725211551`
- Manifest SHA-256: `8b2b2a5ae61ee7e4a4271d35ba102b5aaae4f6fec8257c3d4ba05c13ba420a27`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus seventeen localized state captures including 320-pixel reflow, detail, opaque miss, page 2, the create/edit forms, and every closed outcome notice.
- Management flows run through the real 8.2.2 UI: both composition kinds create, expiry-only edit succeeds under a seeded checkout attempt (dirty omission), a financial edit on the same link fails opaquely, an explicit blank clears expiry, and activate/deactivate land on their notices.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
