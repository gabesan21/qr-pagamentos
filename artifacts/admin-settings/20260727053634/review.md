# Administrator settings hub visual review

- Run: `20260727053634`
- Manifest SHA-256: `fdff8685b2cfd59ac28a139713a027658e10bc9348ad0d5bdb382249364c1b04`
- Grid: six themes × two locales × 375/768/1440 hub captures, plus four localized state captures including 320-pixel reflow, the empty registry, the saved default theme, and the registered exchange currency.
- The default-theme save runs through the delivered POST /admin/settings/default-theme route and persists: a later render shows the saved selection, a merchant created afterward carries the saved theme, and a new administrator keeps NULL.
- The exchange-currency registration runs through the delivered POST /admin/exchange-currencies route and lands back on the hub with the opaque success notice.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The failure notices are induced only in unit/route tests: the closed selects and validated inputs cannot submit an invalid value honestly, so no runtime failure capture exists.
- Visual findings requiring correction: none.
