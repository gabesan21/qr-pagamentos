# Merchant payment-link directory visual review

- Run: `20260725190921`
- Manifest SHA-256: `fea9455915c14b29ebf744e81845a4c8123ca77a3c9341293f1e0b8a05cc1fa9`
- Grid: six themes × two locales × 375/768/1440 directory captures, plus eight localized state captures including 320-pixel reflow, detail, opaque miss, and page 2.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.
- Visual findings requiring correction: none.
