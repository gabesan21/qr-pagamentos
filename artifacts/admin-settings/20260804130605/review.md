# Administrator settings hub visual review

- Run: `20260804130605`
- Manifest SHA-256: `204e3e7cf8006b844813775e5c015b8eac79a0cd085c3a6ac17a18e423af71ab`
- Grid: six themes × two locales × 375/768/1440 hub captures, plus four localized state captures including 320-pixel reflow, the empty registry, the saved default theme, and the registered exchange currency.
- The default-theme save runs through the delivered POST /admin/settings/default-theme route and persists: a later render shows the saved selection, a merchant created afterward carries the saved theme, and a new administrator keeps NULL.
- The exchange-currency registration runs through the delivered POST /admin/exchange-currencies route and lands back on the hub with the opaque success notice.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The failure notices are induced only in unit/route tests: the closed selects and validated inputs cannot submit an invalid value honestly, so no runtime failure capture exists.
- Visual findings requiring correction: none.
