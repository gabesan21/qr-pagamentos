# Merchant orders management visual review

- Run: `20260729021304`
- Manifest SHA-256: `7055f2b95889dc41bc0581a05c380edf36f06076c8a5a4f37894592ba0304a91`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the comment-thread detail, the opaque miss, page 2, every closed outcome notice, and the page-size preference.
- Engagement flows run through the real 8.3.3 UI: comment append, author comment edit under CAS, guarded local-outcome set, and a stale lifecycle CAS that fails opaquely.
- The page-size preference reapplies a stored registered size on the bare URL exactly once and re-stores the explicit toolbar choice.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
