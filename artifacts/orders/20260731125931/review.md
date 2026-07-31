# Merchant orders management visual review

- Run: `20260731125931`
- Manifest SHA-256: `cf45af97568e74c9a8665da1fe2037e16bbb80b3bd884a796a7b7838970ccecf`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the comment-thread detail, the opaque miss, page 2, every closed outcome notice, and the page-size preference.
- Engagement flows run through the real 8.3.3 UI: comment append, author comment edit under CAS, guarded local-outcome set, and a stale lifecycle CAS that fails opaquely.
- The page-size preference reapplies a stored registered size on the bare URL exactly once and re-stores the explicit toolbar choice.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
